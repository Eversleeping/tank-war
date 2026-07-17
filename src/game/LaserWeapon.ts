import type { Dir, Rect, Vec2 } from './types.ts';

export const LASER_MAX_CHARGE_MS = 1100;

export interface LaserTargetView {
  rect: Rect;
  center: Vec2;
}

export function laserChargeRatio(chargeMs: number): number {
  if (!Number.isFinite(chargeMs)) return 0;
  return Math.max(0, Math.min(1, chargeMs / LASER_MAX_CHARGE_MS));
}

export function laserDamage(baseDamage: number, chargeRatio: number): number {
  const ratio = Math.max(0, Math.min(1, chargeRatio));
  return Math.max(1, Math.round(baseDamage * (0.75 + ratio * 1.25)));
}

export function laserRayEnd(
  from: Vec2,
  dir: Dir,
  worldWidth: number,
  worldHeight: number,
): Vec2 {
  const overrun = 24;
  switch (dir) {
    case 'up':
      return { x: from.x, y: -overrun };
    case 'down':
      return { x: from.x, y: worldHeight + overrun };
    case 'left':
      return { x: -overrun, y: from.y };
    case 'right':
      return { x: worldWidth + overrun, y: from.y };
  }
}

export function targetsInLaserPath<T extends LaserTargetView>(
  from: Vec2,
  dir: Dir,
  targets: Iterable<T>,
  halfWidth: number,
): T[] {
  const hits: Array<{ target: T; distance: number }> = [];
  for (const target of targets) {
    const { rect, center } = target;
    let forward: number;
    let crossesBeam: boolean;
    switch (dir) {
      case 'up':
        forward = from.y - center.y;
        crossesBeam = from.x >= rect.x - halfWidth && from.x <= rect.x + rect.w + halfWidth;
        break;
      case 'down':
        forward = center.y - from.y;
        crossesBeam = from.x >= rect.x - halfWidth && from.x <= rect.x + rect.w + halfWidth;
        break;
      case 'left':
        forward = from.x - center.x;
        crossesBeam = from.y >= rect.y - halfWidth && from.y <= rect.y + rect.h + halfWidth;
        break;
      case 'right':
        forward = center.x - from.x;
        crossesBeam = from.y >= rect.y - halfWidth && from.y <= rect.y + rect.h + halfWidth;
        break;
    }
    if (forward >= -halfWidth && crossesBeam) hits.push({ target, distance: forward });
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits.map(({ target }) => target);
}
