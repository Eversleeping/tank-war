import { describe, it, expect } from 'vitest';
import {
  aiTier,
  enemyFireCd,
  enemyHp,
  enemyMaxOnScreen,
  enemyRank,
  enemySpawnInterval,
  enemySpeed,
  enemyTotal,
  sampleCurve,
  type Curve,
} from '../src/game/difficulty.ts';

describe('sampleCurve', () => {
  const curve: Curve = [
    { stage: 1, value: 10 },
    { stage: 5, value: 30 },
    { stage: 10, value: 30 },
  ];

  it('落在首帧之前钳制到首帧值', () => {
    expect(sampleCurve(curve, 0)).toBe(10);
    expect(sampleCurve(curve, -100)).toBe(10);
  });

  it('恰在首帧返回首帧值', () => {
    expect(sampleCurve(curve, 1)).toBe(10);
  });

  it('落在末帧之后钳制到末帧值', () => {
    expect(sampleCurve(curve, 10)).toBe(30);
    expect(sampleCurve(curve, 999)).toBe(30);
  });

  it('两帧之间线性插值', () => {
    // 1→5 从 10 到 30，stage 3 应为中点 20
    expect(sampleCurve(curve, 3)).toBe(20);
    // stage 2 为四分之一处：10 + 0.25*20 = 15
    expect(sampleCurve(curve, 2)).toBe(15);
  });

  it('平段（相邻帧同值）返回该值', () => {
    expect(sampleCurve(curve, 7)).toBe(30);
  });

  it('单点曲线恒返回该点值', () => {
    const one: Curve = [{ stage: 3, value: 42 }];
    expect(sampleCurve(one, 1)).toBe(42);
    expect(sampleCurve(one, 3)).toBe(42);
    expect(sampleCurve(one, 100)).toBe(42);
  });

  it('空曲线抛错', () => {
    expect(() => sampleCurve([], 1)).toThrow();
  });
});

describe('enemyTotal', () => {
  it('第 1 关基线为 8', () => {
    expect(enemyTotal(1)).toBe(8);
  });

  it('随关卡单调不减', () => {
    for (let s = 1; s < 40; s++) {
      expect(enemyTotal(s + 1)).toBeGreaterThanOrEqual(enemyTotal(s));
    }
  });

  it('高关卡封顶 40', () => {
    expect(enemyTotal(30)).toBe(40);
    expect(enemyTotal(100)).toBe(40);
  });
});

describe('enemyMaxOnScreen', () => {
  it('第 1 关为 4', () => {
    expect(enemyMaxOnScreen(1)).toBe(4);
  });

  it('封顶 8', () => {
    expect(enemyMaxOnScreen(21)).toBe(8);
    expect(enemyMaxOnScreen(999)).toBe(8);
  });

  it('单调不减且始终为整数', () => {
    for (let s = 1; s <= 30; s++) {
      const v = enemyMaxOnScreen(s);
      expect(Number.isInteger(v)).toBe(true);
      if (s > 1) expect(v).toBeGreaterThanOrEqual(enemyMaxOnScreen(s - 1));
    }
  });
});

describe('aiTier', () => {
  it('第 1 关为 1，第 21 关及以后为 5', () => {
    expect(aiTier(1)).toBe(1);
    expect(aiTier(21)).toBe(5);
    expect(aiTier(100)).toBe(5);
  });

  it('始终落在 1-5 且为整数', () => {
    for (let s = 1; s <= 40; s++) {
      const t = aiTier(s);
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(5);
      expect(Number.isInteger(t)).toBe(true);
    }
  });
});

describe('enemyRank', () => {
  it('随关卡切换三阶敌军装备', () => {
    expect(enemyRank(1)).toBe(1);
    expect(enemyRank(7)).toBe(1);
    expect(enemyRank(8)).toBe(2);
    expect(enemyRank(15)).toBe(2);
    expect(enemyRank(16)).toBe(3);
    expect(enemyRank(100)).toBe(3);
  });
});

describe('enemyHp', () => {
  it('前 5 关维持 1', () => {
    expect(enemyHp(1)).toBe(1);
    expect(enemyHp(5)).toBe(1);
  });

  it('封顶 6', () => {
    expect(enemyHp(30)).toBe(6);
    expect(enemyHp(200)).toBe(6);
  });

  it('单调不减且为整数', () => {
    for (let s = 1; s <= 40; s++) {
      const v = enemyHp(s);
      expect(Number.isInteger(v)).toBe(true);
      if (s > 1) expect(v).toBeGreaterThanOrEqual(enemyHp(s - 1));
    }
  });
});

describe('enemySpeed', () => {
  it('第 1 关为 90', () => {
    expect(enemySpeed(1)).toBe(90);
  });

  it('封顶 165', () => {
    expect(enemySpeed(31)).toBe(165);
    expect(enemySpeed(500)).toBe(165);
  });

  it('单调不减', () => {
    for (let s = 1; s < 40; s++) {
      expect(enemySpeed(s + 1)).toBeGreaterThanOrEqual(enemySpeed(s));
    }
  });
});

describe('enemyFireCd', () => {
  it('第 1 关最慢（1360）', () => {
    expect(enemyFireCd(1)).toBe(1360);
  });

  it('地板 320（越小越猛）', () => {
    expect(enemyFireCd(27)).toBe(320);
    expect(enemyFireCd(100)).toBe(320);
  });

  it('随关卡单调不增', () => {
    for (let s = 1; s < 40; s++) {
      expect(enemyFireCd(s + 1)).toBeLessThanOrEqual(enemyFireCd(s));
    }
  });
});

describe('enemySpawnInterval', () => {
  it('第 1 关最慢（3080）', () => {
    expect(enemySpawnInterval(1)).toBe(3080);
  });

  it('地板 1100', () => {
    expect(enemySpawnInterval(20)).toBe(1100);
    expect(enemySpawnInterval(80)).toBe(1100);
  });

  it('随关卡单调不增', () => {
    for (let s = 1; s < 40; s++) {
      expect(enemySpawnInterval(s + 1)).toBeLessThanOrEqual(enemySpawnInterval(s));
    }
  });
});
