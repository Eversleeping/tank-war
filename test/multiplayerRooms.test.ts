import { describe, expect, it, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { WebSocket } from 'ws';
import { RoomManager } from '../server/multiplayer/RoomManager.ts';

function fakeSocket(bufferedAmount = 0) {
  const sent: Array<string | Buffer> = [];
  const socket = {
    readyState: WebSocket.OPEN,
    bufferedAmount,
    send: vi.fn((payload: string | Buffer) => sent.push(payload)),
  } as unknown as WebSocket;
  return { socket, sent };
}

function messageTypes(sent: Array<string | Buffer>): string[] {
  return sent.map((payload) => (JSON.parse(decodePayload(payload)) as { type: string }).type);
}

function decodePayload(payload: string | Buffer): string {
  return typeof payload === 'string' ? payload : gunzipSync(payload).toString();
}

describe('multiplayer rooms', () => {
  it('auto-starts a duo matchmaking room when the second player joins', () => {
    const manager = new RoomManager();
    const a = fakeSocket();
    const b = fakeSocket();
    const pa = manager.connect(a.socket);
    const pb = manager.connect(b.socket);
    manager.handle(pa, JSON.stringify({ type: 'hello', name: '甲' }));
    manager.handle(pb, JSON.stringify({ type: 'hello', name: '乙' }));
    manager.handle(pa, JSON.stringify({ type: 'matchmake', mode: 'duo' }));
    manager.handle(pb, JSON.stringify({ type: 'matchmake', mode: 'duo' }));

    expect(manager.roomCount()).toBe(1);
    expect(messageTypes(a.sent)).toContain('game_start');
    expect(messageTypes(b.sent)).toContain('snapshot');
  });

  it('allows the host to start a custom brawl room with two players', () => {
    const manager = new RoomManager();
    const hostSocket = fakeSocket();
    const guestSocket = fakeSocket();
    const host = manager.connect(hostSocket.socket);
    const guest = manager.connect(guestSocket.socket);
    manager.handle(host, JSON.stringify({ type: 'create_room', mode: 'brawl' }));
    const roomMessage = hostSocket.sent
      .map((payload) => JSON.parse(decodePayload(payload)) as { type: string; room?: { code: string } })
      .find((message) => message.type === 'room');
    const code = roomMessage?.room?.code;
    expect(code).toHaveLength(6);

    manager.handle(guest, JSON.stringify({ type: 'join_room', code }));
    manager.handle(host, JSON.stringify({ type: 'start_room' }));

    expect(messageTypes(hostSocket.sent)).toContain('game_start');
    expect(messageTypes(guestSocket.sent)).toContain('snapshot');
  });

  it('keeps a full ten-player matchmaking brawl running after startup', () => {
    const manager = new RoomManager();
    const clients = Array.from({ length: 10 }, () => fakeSocket());
    const peers = clients.map((client) => manager.connect(client.socket));
    peers.forEach((peer, index) => {
      manager.handle(peer, JSON.stringify({ type: 'hello', name: `P${index}` }));
      manager.handle(peer, JSON.stringify({ type: 'matchmake', mode: 'brawl' }));
    });

    for (let tick = 0; tick < 120; tick++) manager.tick(1 / 60);

    for (const client of clients) {
      expect(messageTypes(client.sent)).toContain('game_start');
      expect(messageTypes(client.sent)).not.toContain('game_over');
      const snapshots = client.sent
        .map((payload) => JSON.parse(decodePayload(payload)) as {
          type: string;
          snapshot?: { remainingMs: number; alivePlayers: number; zone?: unknown; players: Array<{ lives: number }> };
        })
        .filter((message) => message.type === 'snapshot');
      expect(snapshots.length).toBeLessThanOrEqual(122);
      expect(snapshots.at(-1)?.snapshot?.remainingMs).toBeGreaterThan(27_000);
      expect(snapshots.at(-1)?.snapshot?.alivePlayers).toBe(10);
      expect(snapshots.at(-1)?.snapshot?.zone).toBeDefined();
      expect(snapshots.at(-1)?.snapshot?.players.every((player) => player.lives === 5)).toBe(true);
    }
  });

  it('drops stale snapshots while a client send queue is congested', () => {
    const manager = new RoomManager();
    const a = fakeSocket();
    const b = fakeSocket();
    const pa = manager.connect(a.socket);
    const pb = manager.connect(b.socket);
    manager.handle(pa, JSON.stringify({ type: 'matchmake', mode: 'duo' }));
    manager.handle(pb, JSON.stringify({ type: 'matchmake', mode: 'duo' }));
    const snapshotsBefore = messageTypes(a.sent).filter((type) => type === 'snapshot').length;

    (a.socket as unknown as { bufferedAmount: number }).bufferedAmount = 5 * 1024;
    for (let tick = 0; tick < 60; tick++) manager.tick(1 / 60);
    const snapshotsWhileCongested = messageTypes(a.sent).filter((type) => type === 'snapshot').length;
    expect(snapshotsWhileCongested).toBe(snapshotsBefore);

    (a.socket as unknown as { bufferedAmount: number }).bufferedAmount = 0;
    for (let tick = 0; tick < 3; tick++) manager.tick(1 / 60);
    const snapshotsAfterRecovery = messageTypes(a.sent).filter((type) => type === 'snapshot').length;
    expect(snapshotsAfterRecovery).toBeGreaterThan(snapshotsWhileCongested);
  });

  it('answers application-level latency probes without joining a room', () => {
    const manager = new RoomManager();
    const client = fakeSocket();
    const peer = manager.connect(client.socket);

    manager.handle(peer, JSON.stringify({ type: 'ping', id: 42 }));

    const pong = client.sent
      .map((payload) => JSON.parse(decodePayload(payload)) as { type: string; id?: number })
      .find((message) => message.type === 'pong');
    expect(pong).toEqual({ type: 'pong', id: 42 });
  });

  it('broadcasts an authoritative snapshot immediately when movement stops', () => {
    const manager = new RoomManager();
    const a = fakeSocket();
    const b = fakeSocket();
    const pa = manager.connect(a.socket);
    const pb = manager.connect(b.socket);
    manager.handle(pa, JSON.stringify({ type: 'matchmake', mode: 'duo' }));
    manager.handle(pb, JSON.stringify({ type: 'matchmake', mode: 'duo' }));
    manager.handle(pa, JSON.stringify({
      type: 'input', input: { dir: 'right', firing: false, weapon: 'normal', seq: 1 },
    }));
    const beforeStop = messageTypes(a.sent).filter((type) => type === 'snapshot').length;

    manager.handle(pa, JSON.stringify({
      type: 'input', input: { dir: null, firing: false, weapon: 'normal', seq: 2 },
    }));

    const afterStop = messageTypes(a.sent).filter((type) => type === 'snapshot').length;
    expect(afterStop).toBe(beforeStop + 1);
  });
});
