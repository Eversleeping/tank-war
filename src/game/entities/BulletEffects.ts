import type { BulletSpec } from '../BulletTypes.ts';
import { rectsOverlap, type Vec2 } from '../types.ts';
import type { World } from '../World.ts';
import type { Tank } from './Tank.ts';

export interface BulletEffectSource {
  readonly center: Vec2;
  readonly damage: number;
  readonly spec: BulletSpec;
  readonly owner: Tank;
}

export interface BulletEffectContext {
  world: World;
  tanks: () => Iterable<Tank>;
  playBeam: (from: Vec2, to: Vec2, color: string, width: number) => void;
}

export function applyBulletImpactEffects(
  source: BulletEffectSource,
  target: Tank,
  ctx: BulletEffectContext,
): void {
  if ((source.spec.burnMs ?? 0) > 0 && (source.spec.burnDamage ?? 0) > 0) {
    target.ignite(source.owner, source.spec.burnMs!, source.spec.burnDamage!, source.spec);
  }
  if ((source.spec.knockback ?? 0) > 0 && target.alive) {
    pushTank(target, source.center, source.spec.knockback!, ctx);
  }
}

export function chainBulletImpact(
  source: BulletEffectSource,
  first: Tank,
  hitEntities: Set<number>,
  ctx: BulletEffectContext,
): void {
  const maxTargets = source.spec.chainTargets ?? 0;
  const radius = source.spec.chainRadius ?? 0;
  if (maxTargets <= 0 || radius <= 0) return;
  const used = new Set<number>([first.id]);
  let current = first;
  for (let i = 0; i < maxTargets; i++) {
    let next: Tank | null = null;
    let best = radius;
    for (const candidate of ctx.tanks()) {
      if (!candidate.alive || candidate.team === source.owner.team || used.has(candidate.id)) continue;
      const d = Math.hypot(
        candidate.center.x - current.center.x,
        candidate.center.y - current.center.y,
      );
      if (d <= best) {
        best = d;
        next = candidate;
      }
    }
    if (!next) break;
    ctx.playBeam(current.center, next.center, source.spec.color, 3);
    next.takeHit(source.owner, Math.max(1, source.damage - 1), source.spec);
    hitEntities.add(next.id);
    used.add(next.id);
    current = next;
  }
}

function pushTank(
  target: Tank,
  origin: Vec2,
  distance: number,
  ctx: BulletEffectContext,
): void {
  const center = target.center;
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let remaining = distance;
  while (remaining > 0.01) {
    const step = Math.min(4, remaining);
    const next = {
      ...target.rect,
      x: target.rect.x + ux * step,
      y: target.rect.y + uy * step,
    };
    if (!ctx.world.canTankFit(next)) break;
    let blocked = false;
    for (const other of ctx.tanks()) {
      if (other === target || !other.alive) continue;
      if (rectsOverlap(next, other.rect)) {
        blocked = true;
        break;
      }
    }
    if (blocked) break;
    target.rect.x = next.x;
    target.rect.y = next.y;
    remaining -= step;
  }
}
