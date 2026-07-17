import { describe, expect, it, vi } from 'vitest';
import { BULLET_SPECS } from '../src/game/BulletTypes.ts';
import type { World } from '../src/game/World.ts';
import { Bullet, type BulletCtx } from '../src/game/entities/Bullet.ts';
import { Enemy } from '../src/game/entities/Enemy.ts';
import { Player } from '../src/game/entities/Player.ts';

const openWorld = {
  widthPx: 1200,
  heightPx: 900,
  cols: 38,
  rows: 29,
  get: () => 'empty',
  blocksBullet: () => false,
  canTankFit: () => true,
  hitTile: () => false,
  damageBase: () => undefined,
} as unknown as World;

function makeCtx(tanks: Enemy[], bullets: Bullet[], playBeam = vi.fn()): BulletCtx {
  return {
    world: openWorld,
    tanks: () => tanks,
    bullets: () => bullets,
    playExplosion: vi.fn(),
    playBeam,
  };
}

describe('炮弹特殊效果', () => {
  it('冰冻弹命中后会真实写入冻结时间', () => {
    const owner = new Player(0, 0);
    const target = new Enemy('scout', 300, 300, 8, 100);
    const bullet = new Bullet(BULLET_SPECS.freeze, owner, 'right', target.center);
    bullet.update(0, makeCtx([target], [bullet]));
    expect(target.freezeMs).toBe(BULLET_SPECS.freeze.freezeMs);
  });

  it('追踪弹会向目标方向修正速度', () => {
    const owner = new Player(0, 0);
    const target = new Enemy('scout', 300, 420, 8, 100);
    const bullet = new Bullet(BULLET_SPECS.homing, owner, 'right', { x: 200, y: 300 });
    bullet.update(0.1, makeCtx([target], [bullet]));
    expect(bullet.vy).toBeGreaterThan(0);
  });

  it('连锁电弧会跳向附近的多个目标并绘制电弧', () => {
    const owner = new Player(0, 0);
    const enemies = [
      new Enemy('scout', 300, 300, 8, 100),
      new Enemy('scout', 390, 300, 8, 100),
      new Enemy('scout', 480, 300, 8, 100),
    ];
    const bullet = new Bullet(BULLET_SPECS.chain, owner, 'right', enemies[0].center);
    const playBeam = vi.fn();
    bullet.update(0, makeCtx(enemies, [bullet], playBeam));
    expect(playBeam).toHaveBeenCalledTimes(2);
    expect(enemies[1].hp).toBeLessThan(enemies[1].maxHp);
    expect(enemies[2].hp).toBeLessThan(enemies[2].maxHp);
  });

  it('等离子命中后会持续灼烧', () => {
    const owner = new Player(0, 0);
    const target = new Enemy('scout', 300, 300, 8, 100);
    const bullet = new Bullet(BULLET_SPECS.plasma, owner, 'right', target.center);
    bullet.update(0, makeCtx([target], [bullet]));
    const afterImpact = target.hp;
    target.update(0.5);
    expect(target.hp).toBeLessThan(afterImpact);
    expect(target.burnMs).toBeGreaterThan(0);
  });

  it('震荡弹会把目标推离爆心', () => {
    const owner = new Player(0, 0);
    const target = new Enemy('scout', 300, 300, 8, 100);
    const startX = target.rect.x;
    const bullet = new Bullet(BULLET_SPECS.shockwave, owner, 'right', {
      x: target.center.x - 10,
      y: target.center.y,
    });
    bullet.update(0, makeCtx([target], [bullet]));
    expect(target.rect.x).toBeGreaterThan(startX);
  });
});
