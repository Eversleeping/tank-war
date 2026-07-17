import { rectsOverlap } from '../types.ts';
import type { Vec2 } from '../types.ts';
import type { BulletKind } from '../BulletKind.ts';
import type { Bullet } from './Bullet.ts';

type PlayExplosion = (pos: Vec2, radius: number, color: string, kind?: BulletKind) => void;

export function resolveBulletClashes(
  bullet: Bullet,
  bullets: Iterable<Bullet>,
  playExplosion: PlayExplosion,
): boolean {
  for (const other of bullets) {
    if (other === bullet || !other.alive) continue;
    if (other.owner.team === bullet.owner.team) continue;
    if (!rectsOverlap(bullet.rect, other.rect)) continue;

    const a = bullet.center;
    const b = other.center;
    const stronger = bullet.damage >= other.damage ? bullet : other;
    playExplosion(
      { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      Math.max(8, Math.min(18, bullet.rect.w + other.rect.w)),
      stronger.spec.color,
      stronger.spec.id,
    );

    if (bullet.damage === other.damage) {
      bullet.destroy();
      other.destroy();
      return true;
    }
    if (bullet.damage > other.damage) {
      bullet.damage -= other.damage;
      other.destroy();
      continue;
    }
    other.damage -= bullet.damage;
    bullet.destroy();
    return true;
  }
  return false;
}
