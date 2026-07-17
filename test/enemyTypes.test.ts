import { describe, expect, it } from 'vitest';
import { BULLET_SPECS } from '../src/game/BulletTypes.ts';
import {
  ENEMY_PROFILES,
  Enemy,
  rollEnemyKind,
  type EnemyKind,
} from '../src/game/entities/Enemy.ts';
import { Player } from '../src/game/entities/Player.ts';

describe('敌军类型', () => {
  it('提供 7 类常规敌人和 1 类 Boss', () => {
    const kinds = Object.keys(ENEMY_PROFILES) as EnemyKind[];
    expect(kinds).toHaveLength(8);
    expect(kinds).toContain('raider');
    expect(kinds).toContain('demolisher');
    expect(kinds).toContain('boss');
  });

  it('每类敌人的战斗特征组合都不同', () => {
    const signatures = Object.values(ENEMY_PROFILES).map((p) =>
      [p.bullet, p.hpBonus, p.speedMul, p.targetBias, p.evasion, p.armor].join(':'),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('最高 AI 档位能够抽取全部 7 类常规敌人', () => {
    const rolls = [0.04, 0.12, 0.3, 0.47, 0.62, 0.76, 0.92];
    const kinds = new Set(rolls.map((r) => rollEnemyKind(5, () => r)));
    expect(kinds).toEqual(
      new Set<EnemyKind>(['scout', 'gunner', 'brute', 'sniper', 'raider', 'demolisher', 'commander']),
    );
    expect(kinds.has('boss')).toBe(false);
  });

  it('II/III 型同步强化外形等级、耐久、速度、射速和炮弹', () => {
    const rank1 = new Enemy('scout', 0, 0, 2, 100, 1);
    const rank3 = new Enemy('scout', 0, 0, 2, 100, 3);
    expect(rank3.visualTier).toBe(3);
    expect(rank3.maxHp).toBeGreaterThan(rank1.maxHp);
    expect(rank3.speed).toBeGreaterThan(rank1.speed);
    expect(rank3.fireCdMul).toBeLessThan(rank1.fireCdMul);
    expect(rank3.spec().damage).toBe(BULLET_SPECS.normal.damage + 2);
  });

  it('重装车装甲会削减高伤害，但任何命中至少造成 1 点伤害', () => {
    const attacker = new Player(100, 100);
    const brute = new Enemy('brute', 0, 0, 3, 100, 1);
    const startHp = brute.hp;
    brute.takeHit(attacker, 3, BULLET_SPECS.heavy);
    expect(brute.hp).toBe(startHp - 2);
    brute.takeHit(attacker, 1, BULLET_SPECS.normal);
    expect(brute.hp).toBe(startHp - 3);
  });
});
