import type { BulletKind } from '../BulletKind.ts';
import type { BulletSpec } from '../BulletTypes.ts';
import type { Dir, Rect, Team, Vec2 } from '../types.ts';
import type { World } from '../World.ts';
import type { Bullet } from './Bullet.ts';
import { BULLET_SPECS } from '../BulletTypes.ts';
import { TANK_SIZE, TILE } from '../constants.ts';
import { dirToVec, rectsOverlap } from '../types.ts';
import { Entity } from './Entity.ts';

/**
 * 坦克基类。玩家与敌人继承它。
 * 负责：移动/碰撞、开火、受击、冻结、贴图坐标。
 */
export abstract class Tank extends Entity {
  dir: Dir = 'up';
  speed: number;
  hp: number;
  maxHp: number;
  team: Team;
  cooldownMs = 0;
  freezeMs = 0;
  burnMs = 0;
  private burnTickMs = 0;
  private burnDamage = 0;
  private burnSource: Tank | null = null;
  private burnSpec: BulletSpec | null = null;
  invulnMs = 0;
  currentBullet: BulletKind = 'normal';
  moveDist = 0;
  // 持续增益倍率（由 buff 系统设置；默认 1 = 无加成）
  speedMul = 1;
  cooldownMul = 1;
  /** 最近一次造成有效伤害的坦克，用于联机击杀归属。 */
  lastAttacker: Tank | null = null;

  constructor(team: Team, x: number, y: number, hp: number, speed: number) {
    super({ x, y, w: TANK_SIZE, h: TANK_SIZE });
    this.team = team;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
  }

  spec(): BulletSpec {
    return BULLET_SPECS[this.currentBullet];
  }

  /**
   * 尝试沿方向移动。会自动做 tile 碰撞 + 与其他坦克的实体碰撞。
   * 返回是否实际发生了位移。
   */
  tryMove(dt: number, dir: Dir, world: World, others: Iterable<Tank>): boolean {
    this.dir = dir;
    if (this.freezeMs > 0) return false;

    const v = dirToVec(dir);
    const step = this.speed * this.speedMul * dt;

    // 抹角对齐：垂直于移动方向的偏移做微推，让坦克能钻进狭窄的空档。
    const ALIGN = 8;
    if (dir === 'up' || dir === 'down') {
      const off = alignOffset(this.rect.x, TILE, ALIGN);
      if (off !== 0) {
        const nr: Rect = { ...this.rect, x: this.rect.x + off };
        if (world.canTankFit(nr) && !collidesTanks(nr, this, others)) {
          this.rect.x = nr.x;
        }
      }
    } else {
      const off = alignOffset(this.rect.y, TILE, ALIGN);
      if (off !== 0) {
        const nr: Rect = { ...this.rect, y: this.rect.y + off };
        if (world.canTankFit(nr) && !collidesTanks(nr, this, others)) {
          this.rect.y = nr.y;
        }
      }
    }

    // 沿方向做整段位移；若整段被阻挡，缩短距离直到能走一小步。
    let remaining = step;
    let moved = false;
    while (remaining > 0.001) {
      const seg = Math.min(remaining, 4);
      const nr: Rect = {
        x: this.rect.x + v.x * seg,
        y: this.rect.y + v.y * seg,
        w: this.rect.w,
        h: this.rect.h,
      };
      if (!world.canTankFit(nr) || collidesTanks(nr, this, others)) break;
      this.rect.x = nr.x;
      this.rect.y = nr.y;
      this.moveDist += seg;
      remaining -= seg;
      moved = true;
    }
    return moved;
  }

  fire(makeBullet: (spec: BulletSpec, dir: Dir, muzzle: Vec2) => Bullet[]): Bullet[] | null {
    const spec = this.spec();
    if (this.cooldownMs > 0) return null;
    if (this.freezeMs > 0) return null;
    this.cooldownMs = spec.cooldown * this.cooldownMul;
    const muzzle = this.muzzle();
    return makeBullet(spec, this.dir, muzzle);
  }

  muzzle(): Vec2 {
    const c = this.center;
    const off = TANK_SIZE / 2 + 2;
    switch (this.dir) {
      case 'up':
        return { x: c.x, y: c.y - off };
      case 'down':
        return { x: c.x, y: c.y + off };
      case 'left':
        return { x: c.x - off, y: c.y };
      case 'right':
        return { x: c.x + off, y: c.y };
    }
  }

  takeHit(attacker: Tank, damage: number, spec: BulletSpec): void {
    if (!this.alive) return;
    if (this.invulnMs > 0) return;
    if (spec.freezeMs > 0) {
      this.freezeMs = Math.max(this.freezeMs, spec.freezeMs);
    }
    this.lastAttacker = attacker;
    this.hp -= damage;
    if (this.hp <= 0) {
      this.hp = 0;
      this.onKilled(attacker);
    } else {
      this.onDamaged(attacker);
    }
  }

  ignite(attacker: Tank, durationMs: number, damage: number, spec: BulletSpec): void {
    if (!this.alive || durationMs <= 0 || damage <= 0) return;
    this.burnMs = Math.max(this.burnMs, durationMs);
    this.burnDamage = Math.max(this.burnDamage, damage);
    this.burnSource = attacker;
    this.burnSpec = spec;
    if (this.burnTickMs <= 0) this.burnTickMs = 500;
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.age += dt;
    if (this.cooldownMs > 0) this.cooldownMs = Math.max(0, this.cooldownMs - dt * 1000);
    if (this.freezeMs > 0) this.freezeMs = Math.max(0, this.freezeMs - dt * 1000);
    if (this.burnMs > 0 && this.burnSource && this.burnSpec) {
      this.burnMs = Math.max(0, this.burnMs - dt * 1000);
      this.burnTickMs -= dt * 1000;
      if (this.burnTickMs <= 0 && this.alive) {
        this.burnTickMs += 500;
        this.takeHit(this.burnSource, this.burnDamage, this.burnSpec);
      }
      if (this.burnMs <= 0) {
        this.burnSource = null;
        this.burnSpec = null;
        this.burnDamage = 0;
      }
    }
    if (this.invulnMs > 0) this.invulnMs = Math.max(0, this.invulnMs - dt * 1000);
  }

  protected onKilled(_attacker: Tank): void {
    this.destroy();
  }

  protected onDamaged(_attacker: Tank): void {}
}

function alignOffset(coord: number, tile: number, maxNudge: number): number {
  let mod = coord % tile;
  if (mod > tile / 2) mod -= tile;
  if (Math.abs(mod) <= maxNudge) return -mod;
  return 0;
}

function collidesTanks(rect: Rect, self: Tank, others: Iterable<Tank>): boolean {
  for (const t of others) {
    if (t === self || !t.alive) continue;
    if (rectsOverlap(rect, t.rect)) return true;
  }
  return false;
}
