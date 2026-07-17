/**
 * 排行榜后端存储（纯逻辑，便于单测）。
 *
 * 内存实现：一个已排序数组 + 前 1000 名截断，与前端 LocalLeaderboard 的排序规则
 * 保持一致（分数降序 → 关卡高优先 → 早提交优先）。id / createdAt 由服务端权威生成，
 * 客户端提交的同名字段一律忽略，杜绝伪造。
 *
 * 可选文件快照：传入 persist 回调即可在每次写入后落盘（index.ts 用 JSON 文件），
 * 保持零依赖的同时提供"重启不丢档"。若要换 SQLite，只需替换这层实现，api.ts 无需改动。
 */

import {
  LEADERBOARD_CATEGORIES,
  isLeaderboardCategory,
  type LeaderboardCategory,
} from '../src/storage/leaderboardTypes.ts';

export interface StoredEntry {
  id: string;
  mode: LeaderboardCategory;
  name: string;
  score: number;
  stage: number;
  kills: number;
  createdAt: number;
}

/** 提交载荷（服务端会补 id / createdAt）。 */
export interface SubmitInput {
  mode?: LeaderboardCategory;
  name: string;
  score: number;
  stage: number;
  kills: number;
}

const MAX_ENTRIES = 1000;

export interface StoreOptions {
  /** 初始数据（从磁盘恢复用）。 */
  initial?: unknown[];
  /** 每次变更后的持久化回调（可选）。 */
  persist?: (entries: StoredEntry[]) => void;
  /** 生成唯一 id（可注入便于测试确定性）。 */
  idGen?: () => string;
  /** 取当前时间戳（可注入便于测试确定性）。 */
  now?: () => number;
}

export class LeaderboardStore {
  private entries: StoredEntry[];
  private persist?: (entries: StoredEntry[]) => void;
  private idGen: () => string;
  private now: () => number;

  constructor(opts: StoreOptions = {}) {
    this.entries = (opts.initial ?? [])
      .map(normalizeEntry)
      .filter((entry): entry is StoredEntry => entry !== null);
    this.sort();
    this.truncate();
    this.persist = opts.persist;
    this.idGen = opts.idGen ?? defaultId;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 取前 n 名（默认全部，封顶 1000）。 */
  top(mode?: LeaderboardCategory, n?: number): StoredEntry[];
  top(n?: number): StoredEntry[];
  top(modeOrCount: LeaderboardCategory | number = 'single', n = MAX_ENTRIES): StoredEntry[] {
    const mode = typeof modeOrCount === 'string' ? modeOrCount : 'single';
    const requestedCount = typeof modeOrCount === 'number' ? modeOrCount : n;
    const count = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(requestedCount)));
    return this.entries.filter((entry) => entry.mode === mode).slice(0, count);
  }

  /** 当前总条数。 */
  get size(): number {
    return this.entries.length;
  }

  sizeFor(mode: LeaderboardCategory): number {
    return this.entries.filter((entry) => entry.mode === mode).length;
  }

  /**
   * 插入一条战绩。id / createdAt 由服务端生成（忽略客户端传入的这两个字段）。
   * 插入后重新排序并截断为前 1000 名，返回落库的完整记录。
   */
  insert(input: SubmitInput): StoredEntry {
    const full: StoredEntry = {
      id: this.idGen(),
      mode: input.mode ?? 'single',
      name: sanitizeName(input.name),
      score: Math.max(0, Math.floor(input.score)),
      stage: Math.max(1, Math.floor(input.stage)),
      kills: Math.max(0, Math.floor(input.kills)),
      createdAt: this.now(),
    };
    this.entries.push(full);
    this.sort();
    this.truncate();
    this.persist?.(this.entries);
    return full;
  }

  /** 清空（测试 / 本地维护用）。 */
  clear(mode?: LeaderboardCategory): void {
    this.entries = mode ? this.entries.filter((entry) => entry.mode !== mode) : [];
    this.persist?.(this.entries);
  }

  private sort(): void {
    this.entries.sort((a, b) => {
      const modeOrder = LEADERBOARD_CATEGORIES.indexOf(a.mode) - LEADERBOARD_CATEGORIES.indexOf(b.mode);
      if (modeOrder !== 0) return modeOrder;
      if (b.score !== a.score) return b.score - a.score;
      if (b.stage !== a.stage) return b.stage - a.stage;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.createdAt - b.createdAt;
    });
  }

  private truncate(): void {
    this.entries = LEADERBOARD_CATEGORIES.flatMap((mode) =>
      this.entries.filter((entry) => entry.mode === mode).slice(0, MAX_ENTRIES),
    );
  }
}

export function isValidEntry(v: unknown): v is StoredEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    isLeaderboardCategory(e.mode) &&
    typeof e.name === 'string' &&
    typeof e.score === 'number' &&
    typeof e.stage === 'number' &&
    typeof e.kills === 'number' &&
    typeof e.createdAt === 'number'
  );
}

/** 旧版记录没有 mode；它们都来自单人模式，读取时自动迁移。 */
export function normalizeEntry(value: unknown): StoredEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const candidate = {
    ...entry,
    mode: entry.mode ?? 'single',
  };
  return isValidEntry(candidate) ? candidate : null;
}

function sanitizeName(name: string): string {
  const trimmed = (name || '').trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : '无名指挥官';
}

function defaultId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
