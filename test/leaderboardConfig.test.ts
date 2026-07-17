import { describe, expect, it } from 'vitest';
import { readLeaderboardConfig } from '../src/storage/leaderboardConfig.ts';

describe('readLeaderboardConfig', () => {
  it('默认使用同源 /api', () => {
    expect(readLeaderboardConfig(undefined)).toEqual({ baseUrl: '/api' });
    expect(readLeaderboardConfig({})).toEqual({ baseUrl: '/api' });
  });

  it('允许覆盖独立排行榜服务器地址并移除结尾斜杠', () => {
    expect(readLeaderboardConfig({
      VITE_LEADERBOARD_URL: ' http://localhost:8787/api/// ',
    })).toEqual({ baseUrl: 'http://localhost:8787/api' });
  });

  it('空白或非字符串地址回退同源 /api', () => {
    expect(readLeaderboardConfig({ VITE_LEADERBOARD_URL: '   ' })).toEqual({ baseUrl: '/api' });
    expect(readLeaderboardConfig({ VITE_LEADERBOARD_URL: 123 })).toEqual({ baseUrl: '/api' });
  });

  it('旧 VITE_LEADERBOARD_MODE 不再改变服务器唯一数据源', () => {
    expect(readLeaderboardConfig({ VITE_LEADERBOARD_MODE: 'local' })).toEqual({ baseUrl: '/api' });
  });
});
