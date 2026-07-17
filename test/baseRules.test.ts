import { describe, expect, it, vi } from 'vitest';
import { BASE_REPAIR_SHIELD_MS, baseMaxHpForStage, resolveBaseBreach } from '../src/game/baseRules.ts';
import { BULLET_SPECS } from '../src/game/BulletTypes.ts';
import { World } from '../src/game/World.ts';
import { Bullet, type BulletCtx } from '../src/game/entities/Bullet.ts';
import { Enemy } from '../src/game/entities/Enemy.ts';
import { Player } from '../src/game/entities/Player.ts';

function ctx(world: World, bullets: Bullet[]): BulletCtx {
  return {
    world,
    tanks: () => [],
    bullets: () => bullets,
    playExplosion: vi.fn(),
    playBeam: vi.fn(),
  };
}

describe('基地耐久规则', () => {
  it('耐久从 5 点逐步成长并封顶 8 点', () => {
    expect(baseMaxHpForStage(1)).toBe(5);
    expect(baseMaxHpForStage(8)).toBe(5);
    expect(baseMaxHpForStage(9)).toBe(6);
    expect(baseMaxHpForStage(17)).toBe(7);
    expect(baseMaxHpForStage(25)).toBe(8);
    expect(baseMaxHpForStage(100)).toBe(8);
  });

  it('任意伤害值的单次命中都只扣 1 点耐久', () => {
    const world = new World(1, () => 0.5);
    const hp = world.baseHp;
    world.damageBase();
    expect(world.baseHp).toBe(hp - 1);
  });

  it('敌方爆破弹覆盖 2x2 基地时只结算一次', () => {
    const world = new World(1, () => 0.5);
    const owner = new Enemy('demolisher', 0, 0, 1, 100);
    const bullet = new Bullet(BULLET_SPECS.explosive, owner, 'down', {
      x: world.base.x + 32,
      y: world.base.y + 32,
    });
    const hp = world.baseHp;
    bullet.update(0, ctx(world, [bullet]));
    expect(world.baseHp).toBe(hp - 1);
  });

  it('玩家炮弹不会伤害己方基地', () => {
    const world = new World(1, () => 0.5);
    const owner = new Player(0, 0);
    const bullet = new Bullet(BULLET_SPECS.heavy, owner, 'down', {
      x: world.base.x + 32,
      y: world.base.y + 32,
    });
    bullet.update(0, ctx(world, [bullet]));
    expect(world.baseHp).toBe(world.baseMaxHp);
  });

  it('维修恢复基地并在护盾期间免疫伤害', () => {
    const world = new World(1, () => 0.5);
    for (let i = 0; i < world.baseMaxHp; i++) world.damageBase();
    expect(world.baseAlive).toBe(false);
    world.repairBase(3, BASE_REPAIR_SHIELD_MS);
    world.damageBase();
    expect(world.baseHp).toBe(3);
    world.update(BASE_REPAIR_SHIELD_MS / 1000);
    world.damageBase();
    expect(world.baseHp).toBe(2);
  });
});

describe('基地失守处理', () => {
  it('有备用生命时消耗一条并恢复一半耐久', () => {
    expect(resolveBaseBreach(3, 5)).toEqual({ lives: 2, repairHp: 3, gameOver: false });
  });

  it('没有备用生命时才结束游戏', () => {
    expect(resolveBaseBreach(0, 8)).toEqual({ lives: 0, repairHp: 0, gameOver: true });
  });
});
