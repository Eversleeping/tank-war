import { describe, it, expect } from 'vitest';
import { BULLET_SPECS } from '../src/game/BulletTypes.ts';
import {
  MAX_BULLET_LEVEL,
  applyBulletLevel,
  clampLevel,
  nextLevel,
} from '../src/game/BulletLevels.ts';

describe('clampLevel', () => {
  it('夹到 [1, MAX] 区间', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(-3)).toBe(1);
    expect(clampLevel(1)).toBe(1);
    expect(clampLevel(MAX_BULLET_LEVEL)).toBe(MAX_BULLET_LEVEL);
    expect(clampLevel(MAX_BULLET_LEVEL + 10)).toBe(MAX_BULLET_LEVEL);
  });

  it('取整并对非法值降级为 1', () => {
    expect(clampLevel(2.9)).toBe(2);
    expect(clampLevel(NaN)).toBe(1);
    expect(clampLevel(Infinity)).toBe(1);
  });
});

describe('nextLevel', () => {
  it('逐级递增', () => {
    expect(nextLevel(1)).toBe(2);
    expect(nextLevel(2)).toBe(3);
  });

  it('封顶后维持上限', () => {
    expect(nextLevel(MAX_BULLET_LEVEL)).toBe(MAX_BULLET_LEVEL);
    expect(nextLevel(MAX_BULLET_LEVEL + 5)).toBe(MAX_BULLET_LEVEL);
  });
});

describe('applyBulletLevel', () => {
  it('1 级原样返回同一对象（不复制）', () => {
    const base = BULLET_SPECS.normal;
    expect(applyBulletLevel(base, 1)).toBe(base);
  });

  it('非法/低于 1 级视为 1 级', () => {
    const base = BULLET_SPECS.normal;
    expect(applyBulletLevel(base, 0)).toBe(base);
    expect(applyBulletLevel(base, NaN)).toBe(base);
  });

  it('不修改传入的 base（纯函数）', () => {
    const base = BULLET_SPECS.heavy;
    const snapshot = { ...base };
    applyBulletLevel(base, 5);
    expect(base).toEqual(snapshot);
  });

  it('伤害每级 +1', () => {
    const base = BULLET_SPECS.normal;
    expect(applyBulletLevel(base, 2).damage).toBe(base.damage + 1);
    expect(applyBulletLevel(base, 3).damage).toBe(base.damage + 2);
  });

  it('冷却随级下降但不低于基础的 55%', () => {
    const base = BULLET_SPECS.heavy;
    const lv2 = applyBulletLevel(base, 2).cooldown;
    const lv5 = applyBulletLevel(base, 5).cooldown;
    expect(lv2).toBeLessThan(base.cooldown);
    expect(lv5).toBeLessThan(lv2);
    expect(lv5).toBeGreaterThanOrEqual(Math.round(base.cooldown * 0.55));
  });

  it('升级会降低能量消耗但不低于基础的 70%', () => {
    const base = BULLET_SPECS.railgun;
    const lv5 = applyBulletLevel(base, 5);
    expect(lv5.energyCost).toBeLessThan(base.energyCost);
    expect(lv5.energyCost).toBeGreaterThanOrEqual(Math.round(base.energyCost * 0.7));
  });

  it('视觉半径每级 +0.5', () => {
    const base = BULLET_SPECS.normal;
    expect(applyBulletLevel(base, 3).size).toBeCloseTo(base.size + 1);
  });

  it('穿透弹升级增加穿透次数', () => {
    const base = BULLET_SPECS.pierce;
    expect(applyBulletLevel(base, 3).pierce).toBe(base.pierce + 2);
  });

  it('反弹弹升级增加反弹次数', () => {
    const base = BULLET_SPECS.bounce;
    expect(applyBulletLevel(base, 2).bounces).toBe(base.bounces + 1);
  });

  it('爆破弹升级扩大爆炸半径', () => {
    const base = BULLET_SPECS.explosive;
    expect(applyBulletLevel(base, 2).explosionRadius).toBe(base.explosionRadius + 8);
  });

  it('冰冻弹升级延长冻结时长', () => {
    const base = BULLET_SPECS.freeze;
    expect(applyBulletLevel(base, 2).freezeMs).toBe(base.freezeMs + 400);
  });

  it('散射弹每 2 级 +2 发', () => {
    const base = BULLET_SPECS.spread;
    expect(applyBulletLevel(base, 2).spread).toBe(base.spread); // 1 step，floor(1/2)=0
    expect(applyBulletLevel(base, 3).spread).toBe(base.spread + 2); // 2 step
    expect(applyBulletLevel(base, 5).spread).toBe(base.spread + 4); // 4 step
  });

  it('不给普通弹赋予它本没有的能力', () => {
    const base = BULLET_SPECS.normal;
    const lv5 = applyBulletLevel(base, 5);
    expect(lv5.pierce).toBe(0);
    expect(lv5.bounces).toBe(0);
    expect(lv5.explosionRadius).toBe(0);
    expect(lv5.freezeMs).toBe(0);
    expect(lv5.spread).toBe(1);
  });

  it('特殊效果随等级强化', () => {
    const plasma = applyBulletLevel(BULLET_SPECS.plasma, 3);
    expect(plasma.burnMs).toBeGreaterThan(BULLET_SPECS.plasma.burnMs!);
    expect(plasma.burnDamage).toBeGreaterThan(BULLET_SPECS.plasma.burnDamage!);
    const chain = applyBulletLevel(BULLET_SPECS.chain, 3);
    expect(chain.chainTargets).toBeGreaterThan(BULLET_SPECS.chain.chainTargets!);
    expect(chain.chainRadius).toBeGreaterThan(BULLET_SPECS.chain.chainRadius!);
    expect(applyBulletLevel(BULLET_SPECS.shockwave, 2).knockback).toBeGreaterThan(
      BULLET_SPECS.shockwave.knockback!,
    );
  });
});
