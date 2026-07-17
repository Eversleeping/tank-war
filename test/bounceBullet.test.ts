import { describe, expect, it, vi } from 'vitest';
import { BULLET_SPECS } from '../src/game/BulletTypes.ts';
import type { World } from '../src/game/World.ts';
import { Bullet, type BulletCtx } from '../src/game/entities/Bullet.ts';
import { Player } from '../src/game/entities/Player.ts';

function wallWorld(kind: 'brick' | 'steel') {
  const hitTile = vi.fn(() => kind === 'brick');
  const world = {
    widthPx: 320,
    heightPx: 320,
    cols: 10,
    rows: 10,
    get: (col: number) => (col === 1 ? kind : 'empty'),
    blocksBullet: (tile: string) => tile === 'brick' || tile === 'steel',
    hitTile,
  } as unknown as World;
  return { world, hitTile };
}

function context(world: World): BulletCtx {
  return {
    world,
    tanks: () => [],
    bullets: () => [],
    playExplosion: vi.fn(),
    playBeam: vi.fn(),
  };
}

describe('bounce bullet', () => {
  it.each(['brick', 'steel'] as const)('bounces off %s without destroying it', (kind) => {
    const { world, hitTile } = wallWorld(kind);
    const bullet = new Bullet(BULLET_SPECS.bounce, new Player(0, 0), 'right', { x: 28, y: 16 });

    bullet.update(0.05, context(world));

    expect(bullet.alive).toBe(true);
    expect(bullet.vx).toBeLessThan(0);
    expect(bullet.dir).toBe('left');
    expect(bullet.bouncesRemaining).toBe(BULLET_SPECS.bounce.bounces - 1);
    expect(hitTile).not.toHaveBeenCalled();
  });

  it('uses the reflected velocity for the rest of the current frame', () => {
    const { world } = wallWorld('brick');
    const bullet = new Bullet(BULLET_SPECS.bounce, new Player(0, 0), 'right', { x: 28, y: 16 });

    bullet.update(0.05, context(world));

    expect(bullet.center.x).toBeLessThan(32);
    expect(bullet.bouncesRemaining).toBe(2);
  });
});
