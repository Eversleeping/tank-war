import type {
  ServerMessage,
  OnlineInputState,
  OnlineMode,
  OnlinePlayerState,
  RoomKind,
  RoomState,
} from '../../src/multiplayer/protocol.ts';
import type { BulletKind } from '../../src/game/BulletKind.ts';
import { gzipSync } from 'node:zlib';
import { WebSocket } from 'ws';
import {
  BRAWL_SNAPSHOT_HZ,
  ONLINE_CAPACITY,
  ONLINE_MIN_PLAYERS,
  ONLINE_SNAPSHOT_HZ,
} from '../../src/multiplayer/protocol.ts';
import { createOnlineSimulation, type MatchSimulation } from '../../src/multiplayer/simulation/index.ts';
import { packWorldTiles } from '../../src/multiplayer/WorldCodec.ts';
import type { OnlinePeer } from './types.ts';
import type { LeaderboardStore } from '../store.ts';

const MAX_SNAPSHOT_BACKLOG_BYTES = 4 * 1024;

export class OnlineRoom {
  readonly code: string;
  readonly mode: OnlineMode;
  readonly kind: RoomKind;
  readonly members: OnlinePeer[] = [];
  status: 'waiting' | 'playing' = 'waiting';

  private simulation: MatchSimulation | null = null;
  private snapshotTimerMs = 0;
  private snapshotSequence = 0;
  private readonly memberWorldVersions = new Map<string, number>();
  private readonly memberInputs = new Map<string, OnlineInputState>();
  private readonly leaderboardStore: LeaderboardStore | null;

  constructor(
    code: string,
    mode: OnlineMode,
    kind: RoomKind,
    leaderboardStore: LeaderboardStore | null = null,
  ) {
    this.code = code;
    this.mode = mode;
    this.kind = kind;
    this.leaderboardStore = leaderboardStore;
  }

  get capacity(): number {
    return ONLINE_CAPACITY[this.mode];
  }

  get minPlayers(): number {
    return ONLINE_MIN_PLAYERS[this.mode];
  }

  get full(): boolean {
    return this.members.length >= this.capacity;
  }

  add(peer: OnlinePeer): boolean {
    if (this.status !== 'waiting' || this.full) return false;
    if (this.members.includes(peer)) return true;
    this.members.push(peer);
    peer.roomCode = this.code;
    this.broadcastRoom();
    return true;
  }

  remove(peer: OnlinePeer): void {
    const index = this.members.indexOf(peer);
    if (index >= 0) this.members.splice(index, 1);
    peer.roomCode = null;
    this.memberInputs.delete(peer.id);
    if (this.status === 'playing' && this.members.length < this.minPlayers) {
      this.endBecausePlayersLeft();
    }
    this.broadcastRoom();
  }

  canStart(peer: OnlinePeer): boolean {
    if (this.status !== 'waiting' || this.members.length < this.minPlayers) return false;
    if (this.kind === 'matchmaking') return this.full;
    return this.members[0] === peer;
  }

  start(): boolean {
    if (this.status !== 'waiting' || this.members.length < this.minPlayers) return false;
    this.status = 'playing';
    this.simulation = createOnlineSimulation(
      this.mode,
      this.members.map((member) => ({ id: member.id, name: member.name })),
    );
    this.snapshotTimerMs = this.snapshotIntervalMs();
    this.snapshotSequence = 0;
    this.memberWorldVersions.clear();
    this.memberInputs.clear();
    for (const member of this.members) {
      this.send(member, { type: 'game_start', playerId: member.id, mode: this.mode });
    }
    this.broadcastSnapshot(true);
    return true;
  }

  setInput(peer: OnlinePeer, input: OnlineInputState): void {
    if (this.status !== 'playing' || !this.simulation) return;
    const previous = this.memberInputs.get(peer.id);
    if (previous && input.seq <= previous.seq) return;
    this.simulation.setInput(peer.id, input);
    this.memberInputs.set(peer.id, input);
    if (previous?.dir && input.dir === null) {
      this.broadcastSnapshot(false);
      this.snapshotTimerMs = this.snapshotIntervalMs();
    }
  }

  choosePickup(peer: OnlinePeer, weapon: BulletKind): boolean {
    if (this.status !== 'playing' || !this.simulation?.choosePickup) return false;
    const chosen = this.simulation.choosePickup(peer.id, weapon);
    if (chosen) this.broadcastSnapshot(true);
    return chosen;
  }

  tick(dt: number): void {
    if (this.status !== 'playing' || !this.simulation) return;
    this.simulation.step(dt);
    this.snapshotTimerMs -= dt * 1000;
    if (this.snapshotTimerMs <= 0) {
      this.broadcastSnapshot(false);
      this.snapshotTimerMs += this.snapshotIntervalMs();
    }
    if (this.simulation.result) this.finishMatch();
  }

  state(): RoomState {
    return {
      code: this.code,
      mode: this.mode,
      kind: this.kind,
      status: this.status,
      capacity: this.capacity,
      minPlayers: this.minPlayers,
      players: this.members.map((member, index) => ({
        id: member.id,
        name: member.name,
        host: index === 0,
      })),
    };
  }

  broadcastRoom(): void {
    this.broadcast({ type: 'room', room: this.state() });
  }

  private broadcastSnapshot(includeWorld: boolean): void {
    if (!this.simulation) return;
    const sequence = ++this.snapshotSequence;
    const worldVersion = this.simulation.worldVersion;
    let compactPayload: Buffer | null = null;
    let worldPayload: Buffer | null = null;
    for (const member of this.members) {
      if (member.socket.readyState !== WebSocket.OPEN) continue;
      if (member.socket.bufferedAmount > MAX_SNAPSHOT_BACKLOG_BYTES) continue;
      const needsWorld = includeWorld || this.memberWorldVersions.get(member.id) !== worldVersion;
      if (needsWorld) {
        const snapshot = this.simulation.snapshot(true);
        if (snapshot.world) {
          snapshot.world = {
            ...snapshot.world,
            packedTiles: packWorldTiles(snapshot.world.tiles),
            tiles: [],
          };
        }
        worldPayload ??= encodeSnapshot({
          type: 'snapshot',
          sequence,
          snapshot,
        });
        member.socket.send(worldPayload);
        this.memberWorldVersions.set(member.id, worldVersion);
      } else {
        compactPayload ??= encodeSnapshot({
          type: 'snapshot',
          sequence,
          snapshot: this.simulation.snapshot(false),
        });
        member.socket.send(compactPayload);
      }
    }
  }

  private snapshotIntervalMs(): number {
    const snapshotHz = this.mode === 'brawl' ? BRAWL_SNAPSHOT_HZ : ONLINE_SNAPSHOT_HZ;
    return 1000 / snapshotHz;
  }

  private finishMatch(): void {
    if (!this.simulation?.result) return;
    const result = this.simulation.result;
    const snapshot = this.simulation.snapshot(false);
    const players = snapshot.players;
    if (this.leaderboardStore) {
      recordOnlineLeaderboard(this.leaderboardStore, this.mode, snapshot.stage, players);
    }
    this.broadcast({
      type: 'game_over',
      mode: this.mode,
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      reason: result.reason,
      players,
    });
    this.status = 'waiting';
    this.simulation = null;
    this.broadcastRoom();
  }

  private endBecausePlayersLeft(): void {
    this.broadcast({
      type: 'game_over',
      mode: this.mode,
      winnerId: null,
      winnerName: '',
      reason: '其他玩家已离开，联机战斗结束',
      players: this.simulation?.snapshot(false).players ?? [],
    });
    this.status = 'waiting';
    this.simulation = null;
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const member of this.members) {
      if (member.socket.readyState === WebSocket.OPEN) member.socket.send(payload);
    }
  }

  private send(peer: OnlinePeer, message: ServerMessage): void {
    if (peer.socket.readyState === WebSocket.OPEN) peer.socket.send(JSON.stringify(message));
  }
}

export function recordOnlineLeaderboard(
  store: LeaderboardStore,
  mode: OnlineMode,
  stage: number,
  players: OnlinePlayerState[],
): void {
  for (const player of players) {
    store.insert({
      mode,
      name: player.name,
      score: player.score,
      stage: mode === 'duo' ? Math.max(1, stage) : 1,
      kills: player.kills,
    });
  }
}

function encodeSnapshot(message: Extract<ServerMessage, { type: 'snapshot' }>): Buffer {
  return gzipSync(JSON.stringify(message), { level: 3 });
}
