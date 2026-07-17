import type { BulletKind } from '../game/BulletKind.ts';
import type { Dir, TileKind } from '../game/types.ts';

export type OnlineMode = 'duo' | 'brawl';
export type RoomKind = 'matchmaking' | 'custom';
export type RoomStatus = 'waiting' | 'playing';

export interface RoomPlayer {
  id: string;
  name: string;
  host: boolean;
}

export interface RoomState {
  code: string;
  mode: OnlineMode;
  kind: RoomKind;
  status: RoomStatus;
  capacity: number;
  minPlayers: number;
  players: RoomPlayer[];
}

export interface OnlineInputState {
  dir: Dir | null;
  firing: boolean;
  weapon: BulletKind;
  seq: number;
}

export interface OnlineWorldState {
  version: number;
  cols: number;
  rows: number;
  tiles: TileKind[];
  packedTiles?: string;
  baseX: number;
  baseY: number;
}

export interface OnlineZoneState {
  x: number;
  y: number;
  radius: number;
  targetX: number;
  targetY: number;
  targetRadius: number;
  phase: number;
  shrinking: boolean;
  nextChangeMs: number;
}

export interface OnlinePlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: Dir;
  hp: number;
  maxHp: number;
  alive: boolean;
  invulnMs: number;
  freezeMs: number;
  burnMs: number;
  energy: number;
  weapon: BulletKind;
  unlockedWeapons: BulletKind[];
  bulletLevels: Partial<Record<BulletKind, number>>;
  kills: number;
  deaths: number;
  score: number;
  respawnMs: number;
  lives: number;
  ackSeq?: number;
}

export interface OnlineEnemyState {
  id: number;
  kind: string;
  rank: number;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: Dir;
  hp: number;
  maxHp: number;
  alive: boolean;
  invulnMs: number;
  freezeMs: number;
  burnMs: number;
}

export interface OnlineBulletState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: BulletKind;
  team: string;
  ownerId: string | null;
  age: number;
}

export type OnlineCombatEffect =
  | {
      id: number;
      type: 'muzzle';
      x: number;
      y: number;
      angle: number;
      bullet: BulletKind;
      ownerId: string | null;
    }
  | {
      id: number;
      type: 'impact';
      x: number;
      y: number;
      radius: number;
      bullet: BulletKind;
    }
  | {
      id: number;
      type: 'beam';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      width: number;
      bullet: BulletKind;
    }
  | {
      id: number;
      type: 'destroyed';
      x: number;
      y: number;
      radius: number;
      color: string;
      target: 'enemy' | 'player';
    };

export type OnlinePickupKind = BulletKind | 'life';

export interface OnlineWeaponPickupState {
  id: number;
  kind: OnlinePickupKind;
  x: number;
  y: number;
  size: number;
  age: number;
  lifeMs: number;
}

export interface OnlineSnapshot {
  mode: OnlineMode;
  stage: number;
  elapsedMs: number;
  remainingMs: number;
  killTarget: number;
  teamLives: number;
  baseHp: number;
  baseMaxHp: number;
  baseInvulnMs: number;
  remainingEnemies: number;
  alivePlayers: number;
  players: OnlinePlayerState[];
  enemies: OnlineEnemyState[];
  bullets: OnlineBulletState[];
  effects: OnlineCombatEffect[];
  weaponPickups: OnlineWeaponPickupState[];
  zone?: OnlineZoneState;
  world?: OnlineWorldState;
  pickupChoices?: BulletKind[];
  pickupSelectorId?: string;
  pickupRemainingMs?: number;
}

export type ClientMessage =
  | { type: 'hello'; name: string }
  | { type: 'ping'; id: number }
  | { type: 'matchmake'; mode: OnlineMode }
  | { type: 'create_room'; mode: OnlineMode }
  | { type: 'join_room'; code: string }
  | { type: 'leave_room' }
  | { type: 'start_room' }
  | { type: 'choose_pickup'; weapon: BulletKind }
  | { type: 'input'; input: OnlineInputState };

export type ServerMessage =
  | { type: 'welcome'; playerId: string }
  | { type: 'pong'; id: number }
  | { type: 'room'; room: RoomState }
  | { type: 'game_start'; playerId: string; mode: OnlineMode }
  | { type: 'snapshot'; sequence: number; snapshot: OnlineSnapshot }
  | {
      type: 'game_over';
      mode: OnlineMode;
      winnerId: string | null;
      winnerName: string;
      reason: string;
      players: OnlinePlayerState[];
    }
  | { type: 'error'; code: string; message: string };

export const ONLINE_CAPACITY: Record<OnlineMode, number> = {
  duo: 2,
  brawl: 10,
};

export const ONLINE_MIN_PLAYERS: Record<OnlineMode, number> = {
  duo: 2,
  brawl: 2,
};

export const BRAWL_INITIAL_LIVES = 5;
export const BRAWL_ZONE_WAIT_MS = 30 * 1000;
export const BRAWL_ZONE_SHRINK_MS = 35 * 1000;
export const DUO_PICKUP_TIMEOUT_MS = 30 * 1000;
export const ONLINE_SIMULATION_HZ = 60;
export const ONLINE_SNAPSHOT_HZ = 60;
export const BRAWL_SNAPSHOT_HZ = 60;
export const ONLINE_INPUT_HEARTBEAT_HZ = 20;

export function isOnlineMode(value: unknown): value is OnlineMode {
  return value === 'duo' || value === 'brawl';
}

export function sanitizeRoomCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '';
}

export function sanitizeOnlineName(value: unknown): string {
  if (typeof value !== 'string') return '无名指挥官';
  const name = value.trim().slice(0, 16);
  return name || '无名指挥官';
}
