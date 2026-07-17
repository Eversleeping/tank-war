import type { Bullet } from './entities/Bullet.ts';
import type { BulletSpec } from './BulletTypes.ts';
import type { Enemy } from './entities/Enemy.ts';
import type { Tank } from './entities/Tank.ts';
import type { World } from './World.ts';
import type { Dir, Rect, Vec2 } from './types.ts';
import { Bullet as BulletCtor } from './entities/Bullet.ts';
import { TILE } from './constants.ts';
import { distance, rectCenter } from './types.ts';
import { bulletThreatens, dodgeDir } from './dodge.ts';
import { escapeDir, nextStuckCount, shouldForceRepick } from './stuck.ts';

export interface AiContext {
  tier: 1 | 2 | 3 | 4 | 5;
  world: World;
  player: Tank;
  tanks: Tank[];
  bullets: Bullet[];
  rng: () => number;
  baseCenter(): Vec2;
}

/**
 * 敌人 AI。共 5 级智力（对应 stage 分档）。
 *
 * - Tier 1：随机游荡，偶尔转向。看到玩家/基地在同一列/行时会开火。
 * - Tier 2：更主动地朝目标方向选择，命中率提高。
 * - Tier 3：会开火砸砖墙，让路。倾向轮流攻击玩家和基地。
 * - Tier 4：会规避玩家射来的子弹（简单侧移）。开火有预判。
 * - Tier 5：具备"合围"倾向 —— 优先走离玩家最远侧的敌人主攻基地，靠近侧堵玩家。
 */
export class EnemyAI {
  update(dt: number, enemy: Enemy, ctx: AiContext): Bullet[] {
    if (!enemy.alive) return [];

    const targetPref = this.pickTarget(enemy, ctx);

    const target =
      targetPref === 'base'
        ? ctx.baseCenter()
        : ctx.player.alive
          ? ctx.player.center
          : ctx.baseCenter();

    // === 移动决策 ===
    enemy.aiTurnCooldownMs -= dt * 1000;
    const baseTurnInterval = ctx.tier <= 2 ? 900 : ctx.tier === 3 ? 700 : 500;
    const turnInterval = baseTurnInterval * enemy.profile.turnMul;
    let desiredDir: Dir = enemy.dir;

    // Tier 4+：侧移躲子弹
    const dodgeDir = ctx.tier + enemy.profile.evasion >= 4 ? this.pickDodgeDir(enemy, ctx.bullets) : null;
    if (dodgeDir) {
      desiredDir = dodgeDir;
      enemy.aiTurnCooldownMs = 200;
    } else if (shouldForceRepick(enemy.aiStuckCount)) {
      // 连续卡住：强制走垂直脱困方向，打破贴墙抖动
      desiredDir = escapeDir(enemy.dir, ctx.rng);
      enemy.aiStuckCount = 0;
      enemy.aiTurnCooldownMs = turnInterval;
    } else if (enemy.aiTurnCooldownMs <= 0) {
      desiredDir = this.chooseDir(enemy, target, ctx);
      enemy.aiTurnCooldownMs = turnInterval + ctx.rng() * 200;
    }

    // 尝试移动
    const others = ctx.tanks;
    const moved = enemy.tryMove(dt, desiredDir, ctx.world, others);
    // 更新连续卡住计数（移动成功归零，失败累加）
    enemy.aiStuckCount = nextStuckCount(enemy.aiStuckCount, moved);
    if (!moved && enemy.aiTurnCooldownMs > 100) {
      // 被挡住，快速换向
      enemy.aiTurnCooldownMs = 60;
    }

    // === 开火决策 ===
    enemy.aiFireCooldownMs -= dt * 1000;
    if (enemy.aiFireCooldownMs <= 0 && enemy.cooldownMs <= 0) {
      const spec = enemy.spec();
      const shouldFire = this.decideFire(enemy, target, ctx);
      if (shouldFire) {
        const bullets = enemy.fire((sp, dir, m) => this.makeBullets(sp, enemy, dir, m));
        if (bullets && bullets.length > 0) {
          enemy.aiFireCooldownMs = spec.cooldown * enemy.fireCdMul + ctx.rng() * 120;
          return bullets;
        }
      } else {
        enemy.aiFireCooldownMs = 200 + ctx.rng() * 200;
      }
    }
    return [];
  }

  private pickTarget(enemy: Enemy, ctx: AiContext): 'base' | 'player' {
    if (enemy.profile.targetBias === 'player') {
      return ctx.rng() < 0.78 ? 'player' : 'base';
    }
    if (enemy.profile.targetBias === 'base') {
      return ctx.rng() < 0.78 ? 'base' : 'player';
    }
    if (ctx.tier <= 2) return ctx.rng() < 0.35 ? 'player' : 'base';
    if (ctx.tier <= 4) return ctx.rng() < 0.55 ? 'player' : 'base';
    return distance(enemy.center, ctx.player.center) > 8 * TILE ? 'base' : 'player';
  }

  private makeBullets(spec: BulletSpec, owner: Enemy, dir: Dir, muzzle: Vec2): Bullet[] {
    const arr: Bullet[] = [];
    if (spec.spread > 1) {
      const half = (spec.spread - 1) / 2;
      for (let i = 0; i < spec.spread; i++) {
        const angle = (i - half) * spec.spreadAngle;
        arr.push(rotatedBullet(spec, owner, dir, muzzle, angle));
      }
    } else {
      arr.push(new BulletCtor(spec, owner, dir, muzzle));
    }
    return arr;
  }

  private chooseDir(enemy: Enemy, target: Vec2, ctx: AiContext): Dir {
    const c = enemy.center;
    const dx = target.x - c.x;
    const dy = target.y - c.y;

    // 候选方向按目标方向偏好排序
    let primary: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    const secondary: Dir = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left';
    // 狙击车会主动拉开近距离，侧袭车则优先走侧向路线。
    if (enemy.profile.kind === 'sniper' && distance(c, target) < 6 * TILE) {
      primary = flip(primary);
    }
    const opposite = flip(primary);
    const opposite2 = flip(secondary);

    // Tier 越高，越倾向沿主方向
    const stickToPrimary = ctx.tier >= 3 ? 0.8 : 0.6;
    const ordered: Dir[] =
      enemy.profile.kind === 'raider'
        ? [secondary, primary, opposite2, opposite]
        : [primary, secondary, opposite2, opposite];
    const candidates: Dir[] = ctx.rng() < stickToPrimary ? ordered : shuffleTop(ordered, ctx.rng);

    for (const d of candidates) {
      if (canStepInDir(enemy, d, ctx.world, ctx.tanks)) {
        return d;
      }
    }
    return primary;
  }

  private pickDodgeDir(enemy: Enemy, bullets: Bullet[]): Dir | null {
    // 检查附近是否有敌方子弹正逼近且会命中；若有，朝真正垂直于弹道的偏离侧躲避
    const c = enemy.center;
    for (const b of bullets) {
      if (!b.alive || b.owner.team === enemy.team) continue;
      const bc = b.center;
      const dist = Math.hypot(bc.x - c.x, bc.y - c.y);
      if (dist > 6 * TILE) continue;
      if (bulletThreatens(b.vx, b.vy, bc.x, bc.y, c.x, c.y, enemy.rect.w / 2)) {
        return dodgeDir(b.vx, b.vy, bc.x, bc.y, c.x, c.y);
      }
    }
    return null;
  }

  private decideFire(enemy: Enemy, target: Vec2, ctx: AiContext): boolean {
    const c = enemy.center;
    // 命中判断：目标在坦克前方一定角度内，且中间没有 steel 阻挡（brick 允许打）
    const dir = enemy.dir;
    const dx = target.x - c.x;
    const dy = target.y - c.y;

    let aligned = false;
    const tolerance = TILE * enemy.profile.aimTolerance;
    if (dir === 'up') aligned = dy < 0 && Math.abs(dx) < tolerance;
    if (dir === 'down') aligned = dy > 0 && Math.abs(dx) < tolerance;
    if (dir === 'left') aligned = dx < 0 && Math.abs(dy) < tolerance;
    if (dir === 'right') aligned = dx > 0 && Math.abs(dy) < tolerance;

    if (aligned) {
      // 检查前方钢板阻挡（brick 可以打穿一次）
      if (ctx.tier <= 3 || !this.hasSteelBlock(enemy, target, ctx.world)) {
        return true;
      }
    }

    // Tier 3+：如果目标同一行/列但被砖墙阻挡，仍开火砸墙
    if (ctx.tier >= 3 && aligned) return true;

    // Tier 5：随机骚扰射击
    if (ctx.tier >= 5 && ctx.rng() < 0.006) return true;
    // 压制车会进行低概率的非瞄准扫射，形成弹幕压力。
    if (enemy.profile.kind === 'gunner' && ctx.rng() < 0.012) return true;

    return false;
  }

  private hasSteelBlock(enemy: Enemy, target: Vec2, world: World): boolean {
    // 沿方向逐格扫描，遇 steel 视为阻挡
    const c = enemy.center;
    const dx = Math.sign(target.x - c.x);
    const dy = Math.sign(target.y - c.y);
    if (dx === 0 && dy === 0) return false;
    let col = Math.floor(c.x / TILE);
    let row = Math.floor(c.y / TILE);
    const targetCol = Math.floor(target.x / TILE);
    const targetRow = Math.floor(target.y / TILE);
    for (let i = 0; i < 60; i++) {
      if (col === targetCol && row === targetRow) return false;
      const k = world.get(col, row);
      if (k === 'steel') return true;
      col += dx;
      row += dy;
    }
    return false;
  }
}

function flip(d: Dir): Dir {
  switch (d) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function shuffleTop(arr: Dir[], rng: () => number): Dir[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function canStepInDir(enemy: Enemy, d: Dir, world: World, others: Tank[]): boolean {
  const step = TILE / 2;
  const nr: Rect = { ...enemy.rect };
  switch (d) {
    case 'up':
      nr.y -= step;
      break;
    case 'down':
      nr.y += step;
      break;
    case 'left':
      nr.x -= step;
      break;
    case 'right':
      nr.x += step;
      break;
  }
  if (!world.canTankFit(nr)) return false;
  for (const t of others) {
    if (t === enemy || !t.alive) continue;
    if (t.rect.x < nr.x + nr.w && t.rect.x + t.rect.w > nr.x && t.rect.y < nr.y + nr.h && t.rect.y + t.rect.h > nr.y) return false;
  }
  return true;
}

function rotatedBullet(spec: BulletSpec, owner: Enemy, dir: Dir, muzzle: Vec2, angle: number): Bullet {
  const b = new BulletCtor(spec, owner, dir, muzzle);
  const speed = Math.hypot(b.vx, b.vy) || spec.speed;
  const base = Math.atan2(b.vy, b.vx);
  const na = base + angle;
  b.vx = Math.cos(na) * speed;
  b.vy = Math.sin(na) * speed;
  return b;
}

// 静默未使用变量
void rectCenter;
