import { WebSocket } from 'ws';
import { isBulletKind } from '../../src/game/BulletKind.ts';
import type { Dir } from '../../src/game/types.ts';
import {
  isOnlineMode,
  sanitizeOnlineName,
  sanitizeRoomCode,
  type ClientMessage,
  type OnlineInputState,
  type OnlineMode,
  type ServerMessage,
} from '../../src/multiplayer/protocol.ts';
import { OnlineRoom } from './Room.ts';
import type { OnlinePeer } from './types.ts';
import type { LeaderboardStore } from '../store.ts';

const DIRECTIONS = new Set<Dir>(['up', 'down', 'left', 'right']);

export class RoomManager {
  private rooms = new Map<string, OnlineRoom>();
  private readonly leaderboardStore: LeaderboardStore | null;

  constructor(leaderboardStore: LeaderboardStore | null = null) {
    this.leaderboardStore = leaderboardStore;
  }

  connect(socket: WebSocket): OnlinePeer {
    const peer: OnlinePeer = {
      id: randomId(),
      name: '无名指挥官',
      socket,
      roomCode: null,
    };
    this.send(peer, { type: 'welcome', playerId: peer.id });
    return peer;
  }

  disconnect(peer: OnlinePeer): void {
    this.leaveRoom(peer);
  }

  handle(peer: OnlinePeer, raw: string): void {
    const message = parseMessage(raw);
    if (!message) {
      this.error(peer, 'invalid-message', '无法识别的联机消息');
      return;
    }
    if (message.type === 'hello') {
      peer.name = sanitizeOnlineName(message.name);
      return;
    }
    if (message.type === 'ping') {
      if (Number.isSafeInteger(message.id) && message.id >= 0) {
        this.send(peer, { type: 'pong', id: message.id });
      }
      return;
    }
    if (message.type === 'matchmake') {
      this.matchmake(peer, message.mode);
      return;
    }
    if (message.type === 'create_room') {
      this.createRoom(peer, message.mode);
      return;
    }
    if (message.type === 'join_room') {
      this.joinRoom(peer, message.code);
      return;
    }
    if (message.type === 'leave_room') {
      this.leaveRoom(peer);
      return;
    }
    if (message.type === 'start_room') {
      this.startRoom(peer);
      return;
    }
    if (message.type === 'choose_pickup') {
      const room = this.roomOf(peer);
      const weapon = isBulletKind(message.weapon) ? message.weapon : null;
      if (!room || !weapon || !room.choosePickup(peer, weapon)) {
        this.error(peer, 'cannot-choose-pickup', '只有当前选择者可以从本轮战利品中选择武器');
      }
      return;
    }
    if (message.type === 'input') {
      const room = this.roomOf(peer);
      const input = sanitizeInput(message.input);
      if (room && input) room.setInput(peer, input);
    }
  }

  tick(dt: number): void {
    for (const room of this.rooms.values()) room.tick(dt);
  }

  roomCount(): number {
    return this.rooms.size;
  }

  private matchmake(peer: OnlinePeer, mode: OnlineMode): void {
    if (!isOnlineMode(mode)) return;
    this.leaveRoom(peer);
    let room = [...this.rooms.values()].find(
      (candidate) =>
        candidate.mode === mode &&
        candidate.kind === 'matchmaking' &&
        candidate.status === 'waiting' &&
        !candidate.full,
    );
    if (!room) {
      room = new OnlineRoom(this.uniqueCode(), mode, 'matchmaking', this.leaderboardStore);
      this.rooms.set(room.code, room);
    }
    room.add(peer);
    if (room.full) room.start();
  }

  private createRoom(peer: OnlinePeer, mode: OnlineMode): void {
    if (!isOnlineMode(mode)) return;
    this.leaveRoom(peer);
    const room = new OnlineRoom(this.uniqueCode(), mode, 'custom', this.leaderboardStore);
    this.rooms.set(room.code, room);
    room.add(peer);
  }

  private joinRoom(peer: OnlinePeer, rawCode: string): void {
    const code = sanitizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) {
      this.error(peer, 'room-not-found', '没有找到该房间');
      return;
    }
    if (room.status !== 'waiting' || room.full) {
      this.error(peer, 'room-unavailable', '房间已开始或人数已满');
      return;
    }
    this.leaveRoom(peer);
    room.add(peer);
  }

  private startRoom(peer: OnlinePeer): void {
    const room = this.roomOf(peer);
    if (!room) return;
    if (!room.canStart(peer)) {
      this.error(peer, 'cannot-start', `至少需要 ${room.minPlayers} 名玩家，且只有房主可以开始`);
      return;
    }
    room.start();
  }

  private leaveRoom(peer: OnlinePeer): void {
    const room = this.roomOf(peer);
    if (!room) return;
    room.remove(peer);
    if (room.members.length === 0) this.rooms.delete(room.code);
  }

  private roomOf(peer: OnlinePeer): OnlineRoom | null {
    return peer.roomCode ? this.rooms.get(peer.roomCode) ?? null : null;
  }

  private uniqueCode(): string {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    return code;
  }

  private error(peer: OnlinePeer, code: string, message: string): void {
    this.send(peer, { type: 'error', code, message });
  }

  private send(peer: OnlinePeer, message: ServerMessage): void {
    if (peer.socket.readyState === WebSocket.OPEN) peer.socket.send(JSON.stringify(message));
  }
}

function parseMessage(raw: string): ClientMessage | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value.type !== 'string') return null;
    return value as ClientMessage;
  } catch {
    return null;
  }
}

function sanitizeInput(value: unknown): OnlineInputState | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const dir = input.dir === null || input.dir === undefined
    ? null
    : DIRECTIONS.has(input.dir as Dir) ? input.dir as Dir : null;
  const weapon = isBulletKind(input.weapon) ? input.weapon : 'normal';
  const seq = typeof input.seq === 'number' && Number.isFinite(input.seq) ? Math.floor(input.seq) : 0;
  return { dir, weapon, seq, firing: input.firing === true };
}

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}
