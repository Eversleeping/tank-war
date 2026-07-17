import { describe, expect, it, vi } from 'vitest';
import type { BulletSpec } from '../src/game/BulletTypes.ts';
import { BULLET_SPECS } from '../src/game/BulletTypes.ts';
import type { World } from '../src/game/World.ts';
import { Bullet, type BulletCtx } from '../src/game/entities/Bullet.ts';
import { Enemy } from '../src/game/entities/Enemy.ts';
import { Player } from '../src/game/entities/Player.ts';

const emptyWorld = {
  widthPx: 1000,
  heightPx: 1000,
  cols: 32,
  rows: 32,
  get: () => 'empty',
  blocksBullet: () => false,
} as unknown as World;

function spec(id: BulletSpec['id'], damage: number): BulletSpec {
  return { ...BULLET_SPECS[id], damage };
}

function setup(aSpec: BulletSpec, bSpec: BulletSpec, sameTeam = false) {
  const player = new Player(0, 0);
  const enemy = sameTeam ? new Player(100, 100) : new Enemy('scout', 100, 100, 1, 100);
  const a = new Bullet(aSpec, player, 'right', { x: 300, y: 300 });
  const b = new Bullet(bSpec, enemy, 'left', { x: 300, y: 300 });
  const bullets = [a, b];
  const playExplosion = vi.fn();
  const ctx: BulletCtx = {
    world: emptyWorld,
    tanks: () => [],
    bullets: () => bullets,
    playExplosion,
    playBeam: vi.fn(),
  };
  return { a, b, ctx, playExplosion };
}

describe('敌对炮弹按伤害对消', () => {
  it('同种且伤害相等时双方同时消失', () => {
    const { a, b, ctx, playExplosion } = setup(spec('normal', 2), spec('normal', 2));
    a.update(0, ctx);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(playExplosion).toHaveBeenCalledOnce();
  });

  it('高伤害炮弹抵消低伤害炮弹后继续存在', () => {
    const { a, b, ctx } = setup(spec('normal', 4), spec('normal', 1));
    a.update(0, ctx);
    expect(a.alive).toBe(true);
    expect(a.damage).toBe(3);
    expect(b.alive).toBe(false);
  });

  it('低伤害炮弹先更新时仍由高伤害炮弹胜出', () => {
    const { a, b, ctx } = setup(spec('normal', 1), spec('normal', 4));
    a.update(0, ctx);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    expect(b.damage).toBe(3);
  });

  it('不同弹种相撞时高伤害炮弹扣除对方伤害后继续存在', () => {
    const { a, b, ctx, playExplosion } = setup(spec('normal', 1), spec('heavy', 3));
    a.update(0, ctx);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    expect(b.damage).toBe(2);
    expect(playExplosion).toHaveBeenCalledOnce();
  });

  it('不同弹种伤害相等时双方同时消失', () => {
    const { a, b, ctx, playExplosion } = setup(spec('normal', 2), spec('pierce', 2));
    a.update(0, ctx);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(playExplosion).toHaveBeenCalledOnce();
  });

  it('同阵营不同类型炮弹不会互相对消', () => {
    const { a, b, ctx } = setup(spec('normal', 1), spec('heavy', 3), true);
    a.update(0, ctx);
    expect(a.alive).toBe(true);
    expect(b.alive).toBe(true);
  });
});
