// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPlayerName, savePlayerName } from '../src/storage/leaderboard.ts';

beforeEach(() => {
  localStorage.clear();
});

describe('playerName 持久化', () => {
  it('save 后 load 一致，并做 trim 与截断', () => {
    savePlayerName('  指挥官阿尔法超长名字测试一二三四五六  ');
    const name = loadPlayerName();
    expect(name.length).toBeLessThanOrEqual(16);
    expect(name.startsWith('指挥官')).toBe(true);
  });

  it('空名字 save 后回退为默认', () => {
    expect(savePlayerName('   ')).toBe('无名指挥官');
  });

  it('未设置时 load 返回空串', () => {
    expect(loadPlayerName()).toBe('');
  });

  it('浏览器只保存玩家代号，不再保存排行榜记录', () => {
    savePlayerName('测试玩家');
    expect(localStorage.getItem('tankwar/leaderboard/v1')).toBeNull();
  });
});
