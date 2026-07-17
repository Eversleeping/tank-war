import { describe, it, expect } from 'vitest';
import {
  MAX_BUFF_STACKS,
  emptyBuffs,
  addBuff,
  speedMultiplier,
  cooldownMultiplier,
  regenIntervalMs,
  powerUpToBuff,
} from '../src/game/buffs.ts';

describe('emptyBuffs', () => {
  it('三种 buff 初始均为 0 层', () => {
    expect(emptyBuffs()).toEqual({ haste: 0, rapidFire: 0, regen: 0 });
  });

  it('每次返回新对象', () => {
    expect(emptyBuffs()).not.toBe(emptyBuffs());
  });
});

describe('addBuff', () => {
  it('叠加一层且不修改入参', () => {
    const base = emptyBuffs();
    const next = addBuff(base, 'haste');
    expect(next.haste).toBe(1);
    expect(base.haste).toBe(0);
  });

  it('层数封顶', () => {
    let s = emptyBuffs();
    for (let i = 0; i < 10; i++) s = addBuff(s, 'rapidFire');
    expect(s.rapidFire).toBe(MAX_BUFF_STACKS);
  });

  it('可一次叠加多层', () => {
    expect(addBuff(emptyBuffs(), 'regen', 2).regen).toBe(2);
  });
});

describe('speedMultiplier', () => {
  it('0 层为 1', () => {
    expect(speedMultiplier(emptyBuffs())).toBe(1);
  });

  it('每层 +18%，随层单调递增', () => {
    const one = speedMultiplier({ haste: 1, rapidFire: 0, regen: 0 });
    const two = speedMultiplier({ haste: 2, rapidFire: 0, regen: 0 });
    expect(one).toBeCloseTo(1.18);
    expect(two).toBeGreaterThan(one);
  });

  it('封顶层数下 +54%', () => {
    expect(speedMultiplier({ haste: MAX_BUFF_STACKS, rapidFire: 0, regen: 0 })).toBeCloseTo(1.54);
  });
});

describe('cooldownMultiplier', () => {
  it('0 层为 1', () => {
    expect(cooldownMultiplier(emptyBuffs())).toBe(1);
  });

  it('每层 -15%，随层单调递减但不低于 0.4', () => {
    const one = cooldownMultiplier({ haste: 0, rapidFire: 1, regen: 0 });
    const three = cooldownMultiplier({ haste: 0, rapidFire: MAX_BUFF_STACKS, regen: 0 });
    expect(one).toBeCloseTo(0.85);
    expect(three).toBeLessThan(one);
    expect(three).toBeGreaterThanOrEqual(0.4);
  });
});

describe('regenIntervalMs', () => {
  it('0 层不再生（Infinity）', () => {
    expect(regenIntervalMs(emptyBuffs())).toBe(Infinity);
  });

  it('层数越高间隔越短', () => {
    const one = regenIntervalMs({ haste: 0, rapidFire: 0, regen: 1 });
    const two = regenIntervalMs({ haste: 0, rapidFire: 0, regen: 2 });
    const three = regenIntervalMs({ haste: 0, rapidFire: 0, regen: 3 });
    expect(one).toBe(6000);
    expect(two).toBe(4500);
    expect(three).toBe(3000);
    expect(two).toBeLessThan(one);
    expect(three).toBeLessThan(two);
  });
});

describe('powerUpToBuff', () => {
  it('映射三种 buff 道具', () => {
    expect(powerUpToBuff('speed')).toBe('haste');
    expect(powerUpToBuff('rapid')).toBe('rapidFire');
    expect(powerUpToBuff('regen')).toBe('regen');
  });

  it('非 buff 道具返回 null', () => {
    expect(powerUpToBuff('star')).toBeNull();
    expect(powerUpToBuff('bomb')).toBeNull();
    expect(powerUpToBuff('unknown')).toBeNull();
  });
});
