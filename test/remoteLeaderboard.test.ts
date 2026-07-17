import { describe, it, expect, vi } from 'vitest';
import { RemoteLeaderboard } from '../src/storage/remoteLeaderboard.ts';
import type { ScoreEntry } from '../src/storage/leaderboard.ts';
import { signPayload, validatePayload } from '../src/storage/antiCheat.ts';

/** 造一个最小可用的 Response 替身（只实现被用到的 ok/status/json）。 */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response;
}

function entry(over: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    id: 'id-1',
    mode: 'single',
    name: 'A',
    score: 1000,
    stage: 3,
    kills: 10,
    createdAt: 1234,
    ...over,
  };
}

describe('RemoteLeaderboard.top', () => {
  it('请求 /top?n=N 并解析 {entries:[]}', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ entries: [entry(), entry({ id: 'id-2' })] }));
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api', fetchImpl });
    const out = await lb.top('duo', 50);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url).toBe('http://x/api/top?mode=duo&n=50');
    expect(out).toHaveLength(2);
  });

  it('容忍直接返回数组', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([entry()]));
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api', fetchImpl });
    expect(await lb.top('single')).toHaveLength(1);
  });

  it('过滤掉字段不合法的条目', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ entries: [entry(), { id: 'bad' /* 缺字段 */ }] }),
    );
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api', fetchImpl });
    expect(await lb.top('single')).toHaveLength(1);
  });

  it('n 被钳制到 [1,1000]', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ entries: [] }));
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api', fetchImpl });
    await lb.top('brawl', 99999);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://x/api/top?mode=brawl&n=1000');
    await lb.top('brawl', 0);
    expect(fetchImpl.mock.calls[1][0]).toBe('http://x/api/top?mode=brawl&n=1');
  });

  it('结尾多余斜杠被去掉', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ entries: [] }));
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api///', fetchImpl });
    await lb.top('single', 10);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://x/api/top?mode=single&n=10');
  });

  it('非 2xx 抛错', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { ok: false, status: 500 }));
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api', fetchImpl });
    await expect(lb.top('single')).rejects.toThrow(/500/);
  });
});

describe('RemoteLeaderboard.submit', () => {
  it('POST /submit，携带签名，返回解析后的条目', async () => {
    const saved = entry({ id: 'server-id', createdAt: 999 });
    const fetchImpl = vi.fn(async () => jsonResponse({ entry: saved }));
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api', fetchImpl });
    const out = await lb.submit({ mode: 'single', name: 'A', score: 1000, stage: 3, kills: 10 });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://x/api/submit');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    // 签名与本地重算一致
    expect(body.mode).toBe('single');
    const expectSig = signPayload({ mode: 'single', name: 'A', score: 1000, stage: 3, kills: 10 });
    expect(body.sig).toBe(expectSig);
    expect(out.id).toBe('server-id');
  });

  it('本地合理性校验不过时直接拒绝，不发请求', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api', fetchImpl });
    // 分数远超上限
    await expect(
      lb.submit({ mode: 'single', name: 'X', score: 9_999_999_999, stage: 1, kills: 0 }),
    ).rejects.toThrow(/本地校验/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('服务端返回不合法数据时抛错', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ entry: { id: 'x' } }));
    const lb = new RemoteLeaderboard({ baseUrl: 'http://x/api', fetchImpl });
    await expect(lb.submit({ mode: 'single', name: 'A', score: 100, stage: 1, kills: 0 })).rejects.toThrow();
  });
});

describe('RemoteLeaderboard 构造', () => {
  it('无 fetch 实现且全局无 fetch 时抛错', () => {
    const original = (globalThis as { fetch?: unknown }).fetch;
    // @ts-expect-error 故意删除以测试降级
    delete (globalThis as { fetch?: unknown }).fetch;
    try {
      expect(() => new RemoteLeaderboard({ baseUrl: 'http://x' })).toThrow();
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe('提交签名与本地校验协同', () => {
  it('合法载荷 validatePayload.ok 为真', () => {
    expect(validatePayload({ mode: 'single', name: 'A', score: 1000, stage: 3, kills: 10 }).ok).toBe(true);
  });
});
