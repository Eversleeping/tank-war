/**
 * 服务器排行榜 Provider。
 *
 * 线路协议（与 server/ 后端一致）：
 * - GET  {baseUrl}/top?mode=M&n=N → { entries: ScoreEntry[] }
 * - POST {baseUrl}/submit         → body { mode, name, score, stage, kills, sig }
 *                                   → { entry: ScoreEntry }
 * - POST {baseUrl}/clear          → 204（仅测试/本地用途；生产可禁用）
 *
 * 提交前在本地做一次合理性校验并附带签名（见 antiCheat.ts），
 * 服务端会用同盐复算校验，作为防作弊基础。
 */

import type { LeaderboardProvider, ScoreEntry } from './leaderboard.ts';
import { signPayload, validatePayload } from './antiCheat.ts';
import type { LeaderboardCategory } from './leaderboardTypes.ts';

export interface RemoteOptions {
  /** 后端基础地址，例如 'http://localhost:8787/api'。结尾不带斜杠。 */
  baseUrl: string;
  /** 注入的 fetch 实现（默认取全局 fetch），便于单测 mock。 */
  fetchImpl?: typeof fetch;
  /** 请求超时（毫秒）。 */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 8000;
const MAX_ENTRIES = 1000;

export class RemoteLeaderboard implements LeaderboardProvider {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(opts: RemoteOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    const f = opts.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
    if (!f) throw new Error('RemoteLeaderboard: 无可用的 fetch 实现');
    // 绑定到全局，避免 "Illegal invocation"
    this.fetchImpl = opts.fetchImpl ?? f.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  async top(mode: LeaderboardCategory, n = MAX_ENTRIES): Promise<ScoreEntry[]> {
    const count = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(n)));
    const res = await this.request(`/top?mode=${encodeURIComponent(mode)}&n=${count}`, { method: 'GET' });
    const data = (await res.json()) as unknown;
    const entries = extractEntries(data);
    return entries.slice(0, count);
  }

  async submit(entry: Omit<ScoreEntry, 'id' | 'createdAt'>): Promise<ScoreEntry> {
    const payload = {
      mode: entry.mode,
      name: entry.name,
      score: entry.score,
      stage: entry.stage,
      kills: entry.kills,
    };
    // 提交前本地合理性校验：不合理直接拒绝，不浪费一次网络往返。
    const check = validatePayload(payload);
    if (!check.ok) {
      throw new Error(`提交被本地校验拦截：${check.reason}`);
    }
    const body = JSON.stringify({ ...payload, sig: signPayload(payload) });
    const res = await this.request('/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const data = (await res.json()) as unknown;
    const saved = extractEntry(data);
    if (!saved) throw new Error('提交成功但服务端返回数据不合法');
    return saved;
  }

  async clear(): Promise<void> {
    await this.request('/clear', { method: 'POST' });
  }

  /** 统一请求封装：拼地址、超时中断、非 2xx 抛错。 */
  private async request(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        throw new Error(`排行榜请求失败：${res.status} ${res.statusText}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 从 /top 响应里安全取出条目数组（容忍 {entries:[]} 或直接 []）。 */
function extractEntries(data: unknown): ScoreEntry[] {
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { entries?: unknown }).entries)
      ? (data as { entries: unknown[] }).entries
      : [];
  return arr.filter(isValidEntry);
}

/** 从 /submit 响应里安全取出单条（容忍 {entry:{}} 或直接 {}）。 */
function extractEntry(data: unknown): ScoreEntry | null {
  if (isValidEntry(data)) return data;
  if (data && typeof data === 'object') {
    const inner = (data as { entry?: unknown }).entry;
    if (isValidEntry(inner)) return inner;
  }
  return null;
}

function isValidEntry(v: unknown): v is ScoreEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    (e.mode === 'single' || e.mode === 'duo' || e.mode === 'brawl') &&
    typeof e.name === 'string' &&
    typeof e.score === 'number' &&
    typeof e.stage === 'number' &&
    typeof e.kills === 'number' &&
    typeof e.createdAt === 'number'
  );
}
