/**
 * 排行榜后端的路由处理（传输无关，便于单测）。
 *
 * 把「HTTP 语义」抽成纯函数：输入 { method, path, query, body }，输出 { status, body }。
 * node:http 入口（index.ts）只负责把真实请求解析成这个形状、再把结果写回，
 * 因此全部业务分支都能不起服务器直接单测。
 *
 * 防作弊：提交走与前端同一套 antiCheat 校验（合理性 + 签名复算），
 * 服务端为权威方——id / createdAt 由服务端生成，客户端传的一律忽略。
 */

import { validatePayload, verifySignature } from '../src/storage/antiCheat.ts';
import { isLeaderboardCategory } from '../src/storage/leaderboardTypes.ts';
import type { LeaderboardStore } from './store.ts';

export interface ApiRequest {
  method: string;
  /** 已去掉 baseUrl 前缀的路径，如 '/top' '/submit' '/clear'。 */
  path: string;
  /** 查询参数（已解析）。 */
  query: Record<string, string>;
  /** 已解析的 JSON body（GET 请求为 undefined）。 */
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ApiOptions {
  /** 是否允许 /clear（生产建议关闭）。默认 false。 */
  allowClear?: boolean;
}

/**
 * 处理一次排行榜 API 请求。纯函数（仅通过 store 产生副作用）。
 */
export function handleRequest(
  store: LeaderboardStore,
  req: ApiRequest,
  opts: ApiOptions = {},
): ApiResponse {
  const path = req.path.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && path === '/top') {
    const n = parseCount(req.query.n);
    const mode = req.query.mode ?? 'single';
    if (!isLeaderboardCategory(mode)) {
      return { status: 400, body: { error: 'invalid-mode' } };
    }
    return { status: 200, body: { entries: store.top(mode, n) } };
  }

  if (req.method === 'POST' && path === '/submit') {
    return handleSubmit(store, req.body);
  }

  if (req.method === 'POST' && path === '/clear') {
    if (!opts.allowClear) return { status: 403, body: { error: 'clear-disabled' } };
    store.clear();
    return { status: 204, body: null };
  }

  return { status: 404, body: { error: 'not-found' } };
}

function handleSubmit(store: LeaderboardStore, body: unknown): ApiResponse {
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { error: 'invalid-body' } };
  }
  const b = body as Record<string, unknown>;
  if (!isLeaderboardCategory(b.mode)) {
    return { status: 400, body: { error: 'invalid-mode' } };
  }
  if (b.mode !== 'single') {
    return { status: 403, body: { error: 'server-authoritative-mode' } };
  }
  const payload = {
    mode: b.mode,
    name: typeof b.name === 'string' ? b.name : '',
    score: num(b.score),
    stage: num(b.stage),
    kills: num(b.kills),
  };
  const sig = typeof b.sig === 'string' ? b.sig : '';

  // 1) 合理性校验（与前端同一套上界）。
  const check = validatePayload(payload);
  if (!check.ok) {
    return { status: 422, body: { error: 'implausible', reason: check.reason } };
  }
  // 2) 签名复算校验（同盐）。签名不符视为伪造提交。
  if (!verifySignature(payload, sig)) {
    return { status: 401, body: { error: 'bad-signature' } };
  }

  const entry = store.insert(payload);
  return { status: 201, body: { entry } };
}

function parseCount(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
}
