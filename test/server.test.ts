import { describe, it, expect } from 'vitest';
import {
  LeaderboardStore,
  isValidEntry,
  normalizeEntry,
  type StoredEntry,
} from '../server/store.ts';
import { handleRequest, type ApiRequest } from '../server/api.ts';
import { recordOnlineLeaderboard } from '../server/multiplayer/Room.ts';
import { signPayload } from '../src/storage/antiCheat.ts';
import type { OnlinePlayerState } from '../src/multiplayer/protocol.ts';

/** 造一个确定性 id / 时间的 store，便于断言排序与截断。 */
function makeStore(initial?: unknown[]): LeaderboardStore {
  let id = 0;
  let t = 0;
  return new LeaderboardStore({
    initial,
    idGen: () => `id${++id}`,
    now: () => ++t,
  });
}

/** 造一个带合法签名的提交 body。 */
function signedBody(p: { name: string; score: number; stage: number; kills: number }): Record<string, unknown> {
  const payload = { mode: 'single' as const, ...p };
  return { ...payload, sig: signPayload(payload) };
}

describe('LeaderboardStore.insert / top', () => {
  it('按分数降序排列', () => {
    const s = makeStore();
    s.insert({ name: 'A', score: 100, stage: 2, kills: 3 });
    s.insert({ name: 'B', score: 300, stage: 4, kills: 9 });
    s.insert({ name: 'C', score: 200, stage: 3, kills: 6 });
    expect(s.top().map((e) => e.name)).toEqual(['B', 'C', 'A']);
  });

  it('同分时关卡高者优先', () => {
    const s = makeStore();
    s.insert({ name: 'low', score: 100, stage: 1, kills: 0 });
    s.insert({ name: 'high', score: 100, stage: 5, kills: 0 });
    expect(s.top()[0].name).toBe('high');
  });

  it('同分同关卡时先提交者优先', () => {
    const s = makeStore();
    s.insert({ name: 'first', score: 100, stage: 1, kills: 0 });
    s.insert({ name: 'second', score: 100, stage: 1, kills: 0 });
    expect(s.top()[0].name).toBe('first');
  });

  it('服务端生成 id / createdAt，忽略客户端字段', () => {
    const s = makeStore();
    const entry = s.insert({ name: 'X', score: 50, stage: 1, kills: 1 });
    expect(entry.id).toBe('id1');
    expect(entry.createdAt).toBeGreaterThan(0);
  });

  it('空名字回退默认代号', () => {
    const s = makeStore();
    const entry = s.insert({ name: '   ', score: 10, stage: 1, kills: 0 });
    expect(entry.name).toBe('无名指挥官');
  });

  it('top(n) 限制返回数量', () => {
    const s = makeStore();
    for (let i = 0; i < 5; i++) s.insert({ name: `P${i}`, score: i * 10, stage: 1, kills: 0 });
    expect(s.top(2)).toHaveLength(2);
  });

  it('超过 1000 条时截断', () => {
    const s = makeStore();
    for (let i = 0; i < 1005; i++) s.insert({ name: `P${i}`, score: i, stage: 1, kills: 0 });
    expect(s.size).toBe(1000);
    // 最高分应保留（score=1004）
    expect(s.top(1)[0].score).toBe(1004);
  });

  it('三种模式分别排序并各自保留记录', () => {
    const s = makeStore();
    s.insert({ mode: 'single', name: '单人', score: 100, stage: 2, kills: 1 });
    s.insert({ mode: 'duo', name: '双人', score: 300, stage: 5, kills: 9 });
    s.insert({ mode: 'brawl', name: '十人', score: 200, stage: 1, kills: 2 });
    expect(s.top('single').map((entry) => entry.name)).toEqual(['单人']);
    expect(s.top('duo').map((entry) => entry.name)).toEqual(['双人']);
    expect(s.top('brawl').map((entry) => entry.name)).toEqual(['十人']);
  });
});

describe('LeaderboardStore 持久化 / 恢复', () => {
  it('每次写入触发 persist 回调', () => {
    let saved: StoredEntry[] = [];
    const s = new LeaderboardStore({ persist: (e) => (saved = e), idGen: () => 'x', now: () => 1 });
    s.insert({ name: 'A', score: 10, stage: 1, kills: 0 });
    expect(saved).toHaveLength(1);
  });

  it('从 initial 恢复并过滤非法条目后排序', () => {
    const s = makeStore([
      { id: 'a', mode: 'single', name: 'A', score: 10, stage: 1, kills: 0, createdAt: 1 },
      { id: 'b', mode: 'single', name: 'B', score: 99, stage: 1, kills: 0, createdAt: 2 },
      { bad: true } as unknown as StoredEntry,
    ]);
    expect(s.size).toBe(2);
    expect(s.top(1)[0].name).toBe('B');
  });

  it('clear 清空并触发 persist', () => {
    let saved: StoredEntry[] | null = null;
    const s = new LeaderboardStore({ persist: (e) => (saved = e) });
    s.insert({ name: 'A', score: 10, stage: 1, kills: 0 });
    s.clear();
    expect(s.size).toBe(0);
    expect(saved).toEqual([]);
  });
});

describe('isValidEntry', () => {
  it('拒绝缺字段 / 非对象', () => {
    expect(isValidEntry(null)).toBe(false);
    expect(isValidEntry({ id: 'a' })).toBe(false);
    expect(
      isValidEntry({ id: 'a', mode: 'single', name: 'n', score: 1, stage: 1, kills: 0, createdAt: 1 }),
    ).toBe(true);
  });

  it('旧版无 mode 记录迁移到单人榜', () => {
    const migrated = normalizeEntry({
      id: 'legacy', name: '旧玩家', score: 88, stage: 2, kills: 3, createdAt: 1,
    });
    expect(migrated?.mode).toBe('single');
  });
});

describe('handleRequest · GET /top', () => {
  it('返回 { entries } 且按 n 限制', () => {
    const s = makeStore();
    s.insert({ name: 'A', score: 30, stage: 1, kills: 0 });
    s.insert({ name: 'B', score: 20, stage: 1, kills: 0 });
    const res = handleRequest(s, { method: 'GET', path: '/top', query: { n: '1' } });
    expect(res.status).toBe(200);
    expect((res.body as { entries: StoredEntry[] }).entries).toHaveLength(1);
  });

  it('缺 n 时默认返回全部', () => {
    const s = makeStore();
    s.insert({ name: 'A', score: 30, stage: 1, kills: 0 });
    const res = handleRequest(s, { method: 'GET', path: '/top', query: {} });
    expect((res.body as { entries: StoredEntry[] }).entries).toHaveLength(1);
  });

  it('按 mode 返回对应榜单并拒绝未知模式', () => {
    const s = makeStore();
    s.insert({ mode: 'single', name: 'S', score: 30, stage: 1, kills: 0 });
    s.insert({ mode: 'duo', name: 'D', score: 40, stage: 2, kills: 1 });
    const duo = handleRequest(s, { method: 'GET', path: '/top', query: { mode: 'duo' } });
    expect((duo.body as { entries: StoredEntry[] }).entries.map((entry) => entry.name)).toEqual(['D']);
    expect(handleRequest(s, { method: 'GET', path: '/top', query: { mode: 'other' } }).status).toBe(400);
  });
});

describe('handleRequest · POST /submit', () => {
  const req = (body: unknown): ApiRequest => ({
    method: 'POST',
    path: '/submit',
    query: {},
    body,
  });

  it('合法签名 + 合理分数 → 201 落库', () => {
    const s = makeStore();
    const res = handleRequest(s, req(signedBody({ name: 'A', score: 500, stage: 2, kills: 3 })));
    expect(res.status).toBe(201);
    expect((res.body as { entry: StoredEntry }).entry.name).toBe('A');
    expect(s.size).toBe(1);
  });

  it('签名不符 → 401，不落库', () => {
    const s = makeStore();
    const body = signedBody({ name: 'A', score: 500, stage: 2, kills: 3 });
    body.sig = 'deadbeef';
    const res = handleRequest(s, req(body));
    expect(res.status).toBe(401);
    expect(s.size).toBe(0);
  });

  it('分数超上限 → 422，不落库', () => {
    const s = makeStore();
    const p = { mode: 'single' as const, name: 'A', score: 9_999_999, stage: 1, kills: 0 };
    const res = handleRequest(s, req({ ...p, sig: signPayload(p) }));
    expect(res.status).toBe(422);
    expect(s.size).toBe(0);
  });

  it('篡改分数使签名失配 → 拦截', () => {
    const s = makeStore();
    const body = signedBody({ name: 'A', score: 500, stage: 2, kills: 3 });
    body.score = 501; // 改分数但不重算签名
    const res = handleRequest(s, req(body));
    // 501 仍在合理范围内，但签名对不上 → 401
    expect(res.status).toBe(401);
  });

  it('body 非对象 → 400', () => {
    const s = makeStore();
    expect(handleRequest(s, req(undefined)).status).toBe(400);
    expect(handleRequest(s, req('nope')).status).toBe(400);
  });

  it('客户端不能向双人榜或十人榜伪造提交', () => {
    const s = makeStore();
    const body = { mode: 'duo', name: 'A', score: 100, stage: 2, kills: 1 };
    const res = handleRequest(s, req({ ...body, sig: signPayload(body) }));
    expect(res.status).toBe(403);
    expect(s.size).toBe(0);
  });
});

describe('联机权威结算写榜', () => {
  const players = [
    { name: '甲', score: 800, kills: 8 },
    { name: '乙', score: 500, kills: 5 },
  ] as unknown as OnlinePlayerState[];

  it('双人模式记录共享关卡和每名玩家成绩', () => {
    const s = makeStore();
    recordOnlineLeaderboard(s, 'duo', 6, players);
    expect(s.top('duo')).toMatchObject([
      { mode: 'duo', name: '甲', stage: 6, score: 800 },
      { mode: 'duo', name: '乙', stage: 6, score: 500 },
    ]);
  });

  it('十人模式写入十人榜并固定为第 1 阶段', () => {
    const s = makeStore();
    recordOnlineLeaderboard(s, 'brawl', 9, players);
    expect(s.top('brawl').every((entry) => entry.stage === 1)).toBe(true);
  });
});

describe('handleRequest · POST /clear', () => {
  const clearReq: ApiRequest = { method: 'POST', path: '/clear', query: {} };

  it('默认禁用 → 403', () => {
    const s = makeStore();
    s.insert({ name: 'A', score: 10, stage: 1, kills: 0 });
    const res = handleRequest(s, clearReq);
    expect(res.status).toBe(403);
    expect(s.size).toBe(1);
  });

  it('allowClear 开启 → 204 且清空', () => {
    const s = makeStore();
    s.insert({ name: 'A', score: 10, stage: 1, kills: 0 });
    const res = handleRequest(s, clearReq, { allowClear: true });
    expect(res.status).toBe(204);
    expect(s.size).toBe(0);
  });
});

describe('handleRequest · 未知路由', () => {
  it('返回 404', () => {
    const s = makeStore();
    expect(handleRequest(s, { method: 'GET', path: '/nope', query: {} }).status).toBe(404);
    expect(handleRequest(s, { method: 'DELETE', path: '/top', query: {} }).status).toBe(404);
  });

  it('容忍结尾斜杠', () => {
    const s = makeStore();
    const res = handleRequest(s, { method: 'GET', path: '/top/', query: {} });
    expect(res.status).toBe(200);
  });
});
