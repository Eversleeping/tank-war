import type { BulletSpec } from '../../game/BulletTypes.ts';
import { Bullet } from '../../game/entities/Bullet.ts';
import type { Tank } from '../../game/entities/Tank.ts';
import type { Dir, Vec2 } from '../../game/types.ts';

export function makeOnlineBullets(
  spec: BulletSpec,
  owner: Tank,
  dir: Dir,
  muzzle: Vec2,
): Bullet[] {
  if (spec.spread <= 1) return [new Bullet(spec, owner, dir, muzzle)];
  const bullets: Bullet[] = [];
  const half = (spec.spread - 1) / 2;
  for (let index = 0; index < spec.spread; index++) {
    const bullet = new Bullet(spec, owner, dir, muzzle);
    const angle = (index - half) * spec.spreadAngle;
    const base = Math.atan2(bullet.vy, bullet.vx);
    bullet.vx = Math.cos(base + angle) * spec.speed;
    bullet.vy = Math.sin(base + angle) * spec.speed;
    bullets.push(bullet);
  }
  return bullets;
}

export function muzzleFor(center: Vec2, dir: Dir, offset: number): Vec2 {
  if (dir === 'up') return { x: center.x, y: center.y - offset };
  if (dir === 'down') return { x: center.x, y: center.y + offset };
  if (dir === 'left') return { x: center.x - offset, y: center.y };
  return { x: center.x + offset, y: center.y };
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(values: T[], rng: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
