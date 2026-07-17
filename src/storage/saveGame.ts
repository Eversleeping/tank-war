/**
 * 断点续玩存档。把「一局」的关键进度存到 localStorage，刷新后可从本关开头续玩。
 *
 * 设计要点：只存"关卡边界"的持久状态，不存战场瞬时态（敌人 / 子弹 / 道具位置）。
 * 世界地形由 stage 种子确定性生成，负面事件同样按种子重掷，因此续玩时会以
 * 相同布局重开本关。存档时机为每关进入时（见 Game.saveCheckpoint）。
 *
 * 序列化 / 反序列化为纯函数，便于单测；localStorage 读写包一层安全降级。
 */

import { isBulletKind, type BulletKind } from '../game/BulletKind.ts';
import { MAX_BUFF_STACKS, emptyBuffs, type BuffState } from '../game/buffs.ts';
import type { DdaState } from '../game/dda.ts';

/** 存档结构版本号。结构不兼容时递增，旧档反序列化返回 null。 */
export const SAVE_VERSION = 3;

export interface RunSnapshot {
  version: number;
  stage: number;
  score: number;
  kills: number;
  lives: number;
  /** 除 normal 外已拾取的弹种顺序（用于切换栏位重建）。 */
  inventoryOrder: BulletKind[];
  /** 可自动恢复的共享武器能量。 */
  weaponEnergy: number;
  /** 每个弹种的等级。 */
  bulletLevels: Partial<Record<BulletKind, number>>;
  /** 当前选中弹种。 */
  currentBullet: BulletKind;
  /** 跨关保留的持续增益层数。 */
  buffs: BuffState;
  /** 动态难度状态（跨关卡持续，故需存）。 */
  dda: DdaState;
  /** 玩家代号（续玩时沿用）。 */
  name: string;
}

/** 供构造快照的入参（省略 version，由本模块统一填当前版本）。 */
export type RunSnapshotInput = Omit<RunSnapshot, 'version'>;

/** 序列化为字符串（写 localStorage 用）。总是写入当前 SAVE_VERSION。 */
export function serializeRun(input: RunSnapshotInput): string {
  const snap: RunSnapshot = { version: SAVE_VERSION, ...input };
  return JSON.stringify(snap);
}

/**
 * 反序列化并校验。任意字段不合法 / 版本不符 / JSON 损坏时返回 null，
 * 让调用方安全回退到"无存档"。
 */
export function deserializeRun(raw: string | null): RunSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return normalizeSnapshot(parsed);
}

function normalizeSnapshot(v: unknown): RunSnapshot | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1 && o.version !== 2 && o.version !== SAVE_VERSION) return null;
  if (!isPositiveInt(o.stage)) return null;
  if (!isFiniteNum(o.score) || !isFiniteNum(o.kills) || !isFiniteNum(o.lives)) return null;
  if (o.lives < 0) return null;
  if (!isBulletKind(o.currentBullet)) return null;

  const inventoryOrder = sanitizeInventory(o.inventoryOrder);
  const bulletLevels = sanitizeCountMap(o.bulletLevels);
  // v1 使用次数弹药；迁移到 v2 时直接给予满能量。
  const weaponEnergy = o.version === 1 ? 100 : sanitizeEnergy(o.weaponEnergy);
  const buffs = sanitizeBuffs(o.buffs);
  const dda = sanitizeDda(o.dda);
  const name = typeof o.name === 'string' ? o.name.slice(0, 16) : '';

  return {
    version: SAVE_VERSION,
    stage: Math.floor(o.stage),
    score: Math.max(0, Math.floor(o.score)),
    kills: Math.max(0, Math.floor(o.kills)),
    lives: Math.floor(o.lives),
    inventoryOrder,
    weaponEnergy,
    bulletLevels,
    currentBullet: o.currentBullet as BulletKind,
    buffs,
    dda,
    name,
  };
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sanitizeEnergy(v: unknown): number {
  return isFiniteNum(v) ? Math.max(0, Math.min(100, v)) : 100;
}

function sanitizeBuffs(v: unknown): BuffState {
  if (!v || typeof v !== 'object') return emptyBuffs();
  const o = v as Record<string, unknown>;
  return {
    haste: sanitizeBuffStack(o.haste),
    rapidFire: sanitizeBuffStack(o.rapidFire),
    regen: sanitizeBuffStack(o.regen),
  };
}

function sanitizeBuffStack(v: unknown): number {
  if (!isFiniteNum(v)) return 0;
  return Math.max(0, Math.min(MAX_BUFF_STACKS, Math.floor(v)));
}

function isPositiveInt(v: unknown): v is number {
  return isFiniteNum(v) && v >= 1;
}

/** 过滤出合法弹种、去重、且不含 normal（normal 不入背包顺序）。 */
function sanitizeInventory(v: unknown): BulletKind[] {
  if (!Array.isArray(v)) return [];
  const out: BulletKind[] = [];
  for (const item of v) {
    if (isBulletKind(item) && item !== 'normal' && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/** 过滤出「合法弹种 → 非负整数」的映射。 */
function sanitizeCountMap(v: unknown): Partial<Record<BulletKind, number>> {
  const out: Partial<Record<BulletKind, number>> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (isBulletKind(k) && isFiniteNum(n) && n >= 0) {
      out[k] = Math.floor(n);
    }
  }
  return out;
}

function sanitizeDda(v: unknown): DdaState {
  const fallback: DdaState = { level: 0, cleanStreak: 0, deathStreak: 0 };
  if (!v || typeof v !== 'object') return fallback;
  const o = v as Record<string, unknown>;
  return {
    level: isFiniteNum(o.level) ? Math.floor(o.level) : 0,
    cleanStreak: isFiniteNum(o.cleanStreak) && o.cleanStreak >= 0 ? Math.floor(o.cleanStreak) : 0,
    deathStreak: isFiniteNum(o.deathStreak) && o.deathStreak >= 0 ? Math.floor(o.deathStreak) : 0,
  };
}

// ---- localStorage 读写包装（安全降级） ----

const STORAGE_KEY = 'tankwar/save/v1';

/** 写入存档（配额溢出 / 无 localStorage 时静默失败）。 */
export function saveRun(input: RunSnapshotInput): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeRun(input));
  } catch {
    // 静默失败
  }
}

/** 读取存档，无 / 损坏 / 版本不符时返回 null。 */
export function loadRun(): RunSnapshot | null {
  try {
    return deserializeRun(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** 是否存在可续玩的有效存档。 */
export function hasSavedRun(): boolean {
  return loadRun() !== null;
}

/** 清除存档（Game Over / 通关结束时调用）。 */
export function clearRun(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默失败
  }
}
