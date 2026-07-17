import { describe, it, expect } from 'vitest';
import { BULLET_KINDS, isBulletKind, type BulletKind } from '../src/game/BulletKind.ts';
import {
  BULLET_SPECS,
  rollPickupChoices,
  rarityWeight,
  PICKUP_POOL,
} from '../src/game/BulletTypes.ts';

/** 确定性 RNG：给定序列，方便断言选择结果。 */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('BULLET_SPECS', () => {
  it('轻量弹种契约与参数表保持一致', () => {
    expect(Object.keys(BULLET_SPECS)).toEqual([...BULLET_KINDS]);
    for (const kind of BULLET_KINDS) expect(isBulletKind(kind)).toBe(true);
    expect(isBulletKind('unknown')).toBe(false);
    expect(isBulletKind(null)).toBe(false);
  });

  it('每个键的 id 与自身一致', () => {
    for (const key of Object.keys(BULLET_SPECS) as BulletKind[]) {
      expect(BULLET_SPECS[key].id).toBe(key);
    }
  });

  it('稀有度在 1-5 之间', () => {
    for (const spec of Object.values(BULLET_SPECS)) {
      expect(spec.rarity).toBeGreaterThanOrEqual(1);
      expect(spec.rarity).toBeLessThanOrEqual(5);
    }
  });

  it('spread 弹种至少发射一发', () => {
    for (const spec of Object.values(BULLET_SPECS)) {
      expect(spec.spread).toBeGreaterThanOrEqual(1);
    }
  });

  it('所有弹种冷却与速度为正', () => {
    for (const spec of Object.values(BULLET_SPECS)) {
      expect(spec.cooldown).toBeGreaterThan(0);
      expect(spec.speed).toBeGreaterThan(0);
      expect(spec.energyCost).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('rollPickupChoices', () => {
  it('默认返回 3 个不重复的非普通弹种', () => {
    const choices = rollPickupChoices(seq([0, 0, 0]), 3);
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
    expect(choices).not.toContain('normal');
  });

  it('count 可自定义', () => {
    expect(rollPickupChoices(Math.random, 5)).toHaveLength(5);
  });

  it('不会超过池子大小', () => {
    const choices = rollPickupChoices(Math.random, 999);
    expect(choices.length).toBe(PICKUP_POOL.length);
    expect(new Set(choices).size).toBe(PICKUP_POOL.length);
  });

  it('确定性 RNG 产出可复现结果', () => {
    const a = rollPickupChoices(seq([0.1, 0.5, 0.9]), 3);
    const b = rollPickupChoices(seq([0.1, 0.5, 0.9]), 3);
    expect(a).toEqual(b);
  });

  it('传入 stage 仍返回不重复的合法弹种', () => {
    const choices = rollPickupChoices(seq([0.1, 0.4, 0.7]), 3, 10);
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
    for (const k of choices) expect(PICKUP_POOL).toContain(k);
  });

  it('加权采样对固定输入可复现', () => {
    const a = rollPickupChoices(seq([0.2, 0.5, 0.8]), 3, 7);
    const b = rollPickupChoices(seq([0.2, 0.5, 0.8]), 3, 7);
    expect(a).toEqual(b);
  });
});

describe('rarityWeight', () => {
  it('第 1 关低稀有权重更高（mult < 1）', () => {
    expect(rarityWeight(1, 1)).toBeGreaterThan(rarityWeight(5, 1));
  });

  it('高关卡高稀有权重反超（mult > 1）', () => {
    // mult = 1 出现在 stage 约 7.67，取 stage=20 时 mult 明显 > 1
    expect(rarityWeight(5, 20)).toBeGreaterThan(rarityWeight(1, 20));
  });

  it('稀有度 1 的权重恒为 1（与关卡无关）', () => {
    expect(rarityWeight(1, 1)).toBe(1);
    expect(rarityWeight(1, 50)).toBe(1);
  });

  it('对固定高稀有度，关卡越高权重越大', () => {
    expect(rarityWeight(4, 30)).toBeGreaterThan(rarityWeight(4, 5));
  });

  it('高关卡整体偏向高稀有：多次采样平均稀有度上升', () => {
    // 用同一组随机序列，比较 stage=1 与 stage=40 下抽到的平均稀有度
    const draws = 400;
    const rngValues = Array.from({ length: draws }, (_, i) => ((i * 2654435761) % 997) / 997);
    const avgRarity = (stage: number): number => {
      let sum = 0;
      for (let i = 0; i < draws; i++) {
        const [k] = rollPickupChoices(seq([rngValues[i]]), 1, stage);
        sum += BULLET_SPECS[k].rarity;
      }
      return sum / draws;
    };
    expect(avgRarity(40)).toBeGreaterThan(avgRarity(1));
  });
});
