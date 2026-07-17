import type { Dir, Vec2 } from '../types.ts';
import type { BulletSpec } from '../BulletTypes.ts';
import type { BulletKind } from '../BulletKind.ts';
import type { World } from '../World.ts';
import type { Tank } from './Tank.ts';
import { rectsOverlap } from '../types.ts';
import { TILE } from '../constants.ts';
import { Entity } from './Entity.ts';
import { resolveBulletClashes } from './BulletCollision.ts';
import { applyBulletImpactEffects, chainBulletImpact } from './BulletEffects.ts';

export interface BulletCtx {
  world: World;
  tanks: () => Iterable<Tank>;
  bullets: () => Iterable<Bullet>;
  playExplosion: (pos: Vec2, radius: number, color: string, kind?: BulletKind) => void;
  playBeam: (from: Vec2, to: Vec2, color: string, width: number) => void;
}

/**
 * 子弹。持有速度矢量与弹丸规格，逐帧移动，触地或触敌处理。
 */
export class Bullet extends Entity {
  vx: number;
  vy: number;
  dir: Dir;
  spec: BulletSpec;
  owner: Tank;
  damage: number;
  pierceRemaining: number;
  bouncesRemaining: number;
  private hitEntities = new Set<number>();
  private hitBase = false;

  constructor(spec: BulletSpec, owner: Tank, dir: Dir, pos: Vec2) {
    const size = spec.size * 2;
    super({ x: pos.x - size / 2, y: pos.y - size / 2, w: size, h: size });
    this.spec = spec;
    this.owner = owner;
    this.dir = dir;
    this.damage = spec.damage;
    this.pierceRemaining = spec.pierce;
    this.bouncesRemaining = spec.bounces;
    const s = spec.speed;
    switch (dir) {
      case 'up':
        this.vx = 0;
        this.vy = -s;
        break;
      case 'down':
        this.vx = 0;
        this.vy = s;
        break;
      case 'left':
        this.vx = -s;
        this.vy = 0;
        break;
      case 'right':
        this.vx = s;
        this.vy = 0;
        break;
    }
  }

  update(dt: number, ctx: BulletCtx): void {
    if (!this.alive) return;
    this.age += dt;

    // 追踪：调整方向到最近敌人
    if (this.spec.homing) {
      const target = this.findHomingTarget(ctx);
      if (target) {
        const c = this.center;
        const tc = target.center;
        const dx = tc.x - c.x;
        const dy = tc.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        // 目标方向单位向量
        const tx = dx / len;
        const ty = dy / len;
        // 当前速度单位向量
        const speed = this.spec.speed;
        const cx = this.vx / speed;
        const cy = this.vy / speed;
        // 每秒最多转 4.5 rad
        const turnRate = 4.5 * dt;
        const nx = cx + (tx - cx) * Math.min(1, turnRate);
        const ny = cy + (ty - cy) * Math.min(1, turnRate);
        const nl = Math.hypot(nx, ny) || 1;
        this.vx = (nx / nl) * speed;
        this.vy = (ny / nl) * speed;
      }
    }

    // 移动 + 逐步分帧检测（避免高速穿墙）
    const step = Math.max(2, Math.min(8, this.rect.w));
    const dist = Math.hypot(this.vx, this.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / step));
    const stepDt = dt / steps;
    for (let i = 0; i < steps && this.alive; i++) {
      // A ricochet must affect the remaining sub-steps in the same frame.
      this.rect.x += this.vx * stepDt;
      this.rect.y += this.vy * stepDt;
      // 出界
      if (
        this.rect.x < -this.rect.w ||
        this.rect.y < -this.rect.h ||
        this.rect.x > ctx.world.widthPx ||
        this.rect.y > ctx.world.heightPx
      ) {
        this.onEnd(ctx);
        return;
      }
      // tile 命中
      if (this.checkTile(ctx)) return;
      // 敌对炮弹按实际剩余伤害对消，升级后的伤害会自然参与判定
      if (resolveBulletClashes(this, ctx.bullets(), ctx.playExplosion)) return;
      // 实体命中
      if (this.checkTanks(ctx)) return;
    }

    // 追踪弹最长寿命
    if (this.age > 4) this.onEnd(ctx);
  }

  private findHomingTarget(ctx: BulletCtx): Tank | null {
    let best: Tank | null = null;
    let bestDist = Infinity;
    const c = this.center;
    const ownerTeam = this.owner.team;
    for (const t of ctx.tanks()) {
      if (!t.alive || t.team === ownerTeam) continue;
      const tc = t.center;
      const d = Math.hypot(tc.x - c.x, tc.y - c.y);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  private checkTile(ctx: BulletCtx): boolean {
    const c = this.center;
    const col = Math.floor(c.x / TILE);
    const row = Math.floor(c.y / TILE);
    const world = ctx.world;
    const kind = world.get(col, row);
    if (!world.blocksBullet(kind) && !(col < 0 || row < 0 || col >= world.cols || row >= world.rows)) {
      return false;
    }
    // 命中
    if (kind === 'base') {
      // 玩家炮弹会被基地挡住，但不会伤害己方建筑。
      if (this.owner.team === 'enemy') {
        world.hitTile(col, row, this.damage, this.spec.breaksSteel);
        this.hitBase = true;
      }
      this.detonate(ctx);
      return true;
    }
    // 弹跳弹优先从砖墙、钢板和地图边界反弹，不先破坏墙体。
    if (this.bouncesRemaining > 0) {
      this.bounce(col, row);
      this.bouncesRemaining--;
      ctx.playExplosion(this.center, 9, this.spec.color, this.spec.id);
      return false;
    }
    world.hitTile(col, row, this.damage, this.spec.breaksSteel);
    this.detonate(ctx);
    return true;
  }

  private bounce(col: number, row: number): void {
    // 简单反弹：判断击中面
    const bx = col * TILE;
    const by = row * TILE;
    const c = this.center;
    const overlapX = Math.min(c.x - bx, bx + TILE - c.x);
    const overlapY = Math.min(c.y - by, by + TILE - c.y);
    if (overlapX < overlapY) {
      if (this.vx > 0) this.rect.x = bx - this.rect.w - 0.01;
      else this.rect.x = bx + TILE + 0.01;
      this.vx = -this.vx;
    } else {
      if (this.vy > 0) this.rect.y = by - this.rect.h - 0.01;
      else this.rect.y = by + TILE + 0.01;
      this.vy = -this.vy;
    }
    this.dir = velocityToDir(this.vx, this.vy);
  }

  private checkTanks(ctx: BulletCtx): boolean {
    for (const t of ctx.tanks()) {
      if (!t.alive) continue;
      if (t.id === this.owner.id) continue;
      if (t.team === this.owner.team) continue;
      if (this.hitEntities.has(t.id)) continue;
      if (rectsOverlap(this.rect, t.rect)) {
        t.takeHit(this.owner, this.damage, this.spec);
        this.hitEntities.add(t.id);
        applyBulletImpactEffects(this, t, ctx);
        if ((this.spec.chainTargets ?? 0) > 0) {
          chainBulletImpact(this, t, this.hitEntities, ctx);
        }
        if (this.pierceRemaining > 0) {
          this.pierceRemaining--;
          ctx.playExplosion(t.center, 10, this.spec.color, this.spec.id);
          continue;
        }
        this.detonate(ctx);
        return true;
      }
    }
    return false;
  }

  private detonate(ctx: BulletCtx): void {
    if (this.spec.explosionRadius > 0) {
      const c = this.center;
      // 对范围内所有敌方坦克造成伤害 / 冻结
      for (const t of ctx.tanks()) {
        if (!t.alive) continue;
        if (t.team === this.owner.team) continue;
        const tc = t.center;
        const d = Math.hypot(tc.x - c.x, tc.y - c.y);
        if (d <= this.spec.explosionRadius) {
          if (!this.hitEntities.has(t.id)) {
            t.takeHit(this.owner, this.damage, this.spec);
            applyBulletImpactEffects(this, t, ctx);
          }
        }
      }
      // 范围内摧毁砖墙
      const r = this.spec.explosionRadius;
      const c0 = Math.floor((c.x - r) / TILE);
      const r0 = Math.floor((c.y - r) / TILE);
      const c1 = Math.floor((c.x + r) / TILE);
      const r1 = Math.floor((c.y + r) / TILE);
      let baseInBlast = false;
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const cx = col * TILE + TILE / 2;
          const cy = row * TILE + TILE / 2;
          if (Math.hypot(cx - c.x, cy - c.y) <= r) {
            if (ctx.world.get(col, row) === 'base') {
              baseInBlast = true;
            } else {
              ctx.world.hitTile(col, row, this.damage, this.spec.breaksSteel);
            }
          }
        }
      }
      if (baseInBlast && !this.hitBase && this.owner.team === 'enemy') {
        ctx.world.damageBase();
        this.hitBase = true;
      }
      ctx.playExplosion(c, r, this.spec.color, this.spec.id);
    } else {
      ctx.playExplosion(this.center, Math.max(9, this.spec.size * 3), this.spec.color, this.spec.id);
    }
    this.onEnd(ctx);
  }

  private onEnd(_ctx: BulletCtx): void {
    this.destroy();
  }
}

function velocityToDir(vx: number, vy: number): Dir {
  if (Math.abs(vx) > Math.abs(vy)) return vx > 0 ? 'right' : 'left';
  return vy > 0 ? 'down' : 'up';
}
