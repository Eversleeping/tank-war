/**
 * 排行榜后端服务入口（node:http，零第三方依赖）。
 *
 * 用法：
 *   pnpm run server
 *
 * 环境变量：
 * - PORT       监听端口（默认 8787）
 * - LB_DATA    数据文件路径（默认 server/data/leaderboard.json），启动时载入、写入后落盘
 * - LB_ALLOW_CLEAR  设为 '1' 时开放 /clear（默认关闭）
 *
 * 路由（前缀 /api）：
 * - GET  /api/top?n=N
 * - POST /api/submit
 * - POST /api/clear（需 LB_ALLOW_CLEAR=1）
 *
 * 数据落盘为 JSON 文件（零依赖）。若需换 SQLite，只替换 store 的持久化层即可，
 * api.ts / 路由无需改动。
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { handleRequest, type ApiRequest } from './api.ts';
import { LeaderboardStore, type StoredEntry } from './store.ts';
import { attachMultiplayerServer } from './multiplayer/MultiplayerServer.ts';

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.LB_DATA || 'server/data/leaderboard.json';
const ALLOW_CLEAR = process.env.LB_ALLOW_CLEAR === '1';
const API_PREFIX = '/api';
const MAX_BODY_BYTES = 1024; // 提交载荷很小，限制请求体防滥用

function loadInitial(): unknown[] {
  try {
    const raw = readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // 首次启动无文件属正常
  }
}

function persist(entries: StoredEntry[]): void {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(entries), 'utf8');
  } catch (err) {
    console.error('[leaderboard] 落盘失败：', err);
  }
}

const store = new LeaderboardStore({ initial: loadInitial(), persist });

/** 读取请求体（带大小上限，超限直接拒绝）。 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function setCors(res: ServerResponse): void {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  // 仅处理 API 前缀；其余 404
  if (!url.pathname.startsWith(API_PREFIX)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not-found' }));
    return;
  }

  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams) query[k] = v;

  let body: unknown;
  if (req.method === 'POST') {
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid-body' }));
      return;
    }
  }

  const apiReq: ApiRequest = {
    method: req.method ?? 'GET',
    path: url.pathname.slice(API_PREFIX.length) || '/',
    query,
    body,
  };
  const result = handleRequest(store, apiReq, { allowClear: ALLOW_CLEAR });

  if (result.body === null) {
    res.writeHead(result.status).end();
  } else {
    res.writeHead(result.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body));
  }
});

attachMultiplayerServer(server, store);

server.listen(PORT, HOST, () => {
  console.log(`[leaderboard] 监听 http://localhost:${PORT}${API_PREFIX}  (数据文件：${DATA_FILE}, /clear：${ALLOW_CLEAR ? '开' : '关'})`);
});
