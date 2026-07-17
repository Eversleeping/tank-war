import { describe, it, expect } from 'vitest';
import {
  BOSS_TURRET_DIRS,
  bossBarrageInterval,
  bossDiagonalAngles,
  bossHp,
  isBossStage,
  remainingEnemyCount,
} from '../src/game/boss.ts';

describe('isBossStage', () => {
  it('每 5 关为 Boss 关', () => {
    expect(isBossStage(5)).toBe(true);
    expect(isBossStage(10)).toBe(true);
    expect(isBossStage(15)).toBe(true);
  });

  it('非 5 的倍数不是 Boss 关', () => {
    for (const s of [1, 2, 3, 4, 6, 7, 9, 11, 14]) {
      expect(isBossStage(s)).toBe(false);
    }
  });

  it('第 0 关及负数不是 Boss 关', () => {
    expect(isBossStage(0)).toBe(false);
    expect(isBossStage(-5)).toBe(false);
  });
});

describe('bossHp', () => {
  it('非 Boss 关返回 0', () => {
    expect(bossHp(4)).toBe(0);
    expect(bossHp(7)).toBe(0);
  });

  it('Boss 关随档位单调递增', () => {
    const a = bossHp(5);
    const b = bossHp(10);
    const c = bossHp(15);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe('BOSS_TURRET_DIRS', () => {
  it('包含四个正向', () => {
    expect([...BOSS_TURRET_DIRS].sort()).toEqual(['down', 'left', 'right', 'up']);
  });
});

describe('bossDiagonalAngles', () => {
  it('非 Boss 关无斜向', () => {
    expect(bossDiagonalAngles(3)).toEqual([]);
  });

  it('第一档（第 5 关）无斜向', () => {
    expect(bossDiagonalAngles(5)).toEqual([]);
  });

  it('第二档及以上有四个斜向', () => {
    expect(bossDiagonalAngles(10)).toHaveLength(4);
    expect(bossDiagonalAngles(15)).toHaveLength(4);
  });

  it('斜向角度落在四个象限', () => {
    const angles = bossDiagonalAngles(10);
    for (const a of angles) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(2 * Math.PI);
    }
    // 四个角度互不相同
    expect(new Set(angles).size).toBe(4);
  });
});

describe('bossBarrageInterval', () => {
  it('非 Boss 关返回 0', () => {
    expect(bossBarrageInterval(4)).toBe(0);
  });

  it('随档位缩短但有下限', () => {
    const a = bossBarrageInterval(5);
    const b = bossBarrageInterval(10);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThanOrEqual(a);
    // 下限 900
    for (const s of [5, 10, 25, 50, 100]) {
      expect(bossBarrageInterval(s)).toBeGreaterThanOrEqual(900);
    }
  });
});

describe('remainingEnemyCount', () => {
  it('普通关统计生成队列与当前存活敌人', () => {
    expect(remainingEnemyCount(4, 6, 3, false)).toBe(9);
  });

  it('Boss 关在 Boss 登场前预留 1 个计数', () => {
    expect(remainingEnemyCount(5, 0, 0, false)).toBe(1);
  });

  it('Boss 登场后只统计当前存活实体', () => {
    expect(remainingEnemyCount(5, 0, 1, true)).toBe(1);
    expect(remainingEnemyCount(5, 0, 0, true)).toBe(0);
  });

  it('异常负数输入按 0 处理', () => {
    expect(remainingEnemyCount(3, -2, -1, false)).toBe(0);
  });
});
