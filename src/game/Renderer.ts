import type { Bullet } from './entities/Bullet.ts';
import type { BulletKind } from './BulletKind.ts';
import { BULLET_SPECS, type BulletSpec } from './BulletTypes.ts';
import type { Camera } from './Camera.ts';
import type { Enemy, EnemyProfile } from './entities/Enemy.ts';
import type { Player } from './entities/Player.ts';
import type { PowerUp } from './entities/PowerUp.ts';
import type { Dir, Rect, Team, TileKind, Vec2 } from './types.ts';
import type { World } from './World.ts';
import { TILE } from './constants.ts';
import {
  drawEnemyTankVisual,
  drawPlayerTankVisual,
  type TankVisualView,
} from './TankVisuals.ts';
import { WeaponVfx } from './WeaponVfx.ts';

export interface RenderWorldView {
  cols: number;
  rows: number;
  widthPx: number;
  heightPx: number;
  base: Vec2;
  baseHp: number;
  baseMaxHp: number;
  baseAlive: boolean;
  baseInvulnMs: number;
  get(col: number, row: number): TileKind;
}

export interface RenderCameraView {
  x: number;
  y: number;
}

export interface RenderTankView extends TankVisualView {
  rect: Rect;
  center: Vec2;
  dir: Dir;
  team: Team;
  hp: number;
  maxHp: number;
  alive: boolean;
  invulnMs: number;
  freezeMs: number;
  burnMs: number;
  age: number;
  moveDist: number;
  profile?: EnemyProfile;
  visualTier?: number;
  renderColor?: string;
  label?: string;
  local?: boolean;
}

export interface RenderBulletView {
  center: Vec2;
  vx: number;
  vy: number;
  spec: BulletSpec;
  age: number;
  alive: boolean;
}

export interface RenderWeaponPickupView {
  kind: BulletKind | 'life';
  x: number;
  y: number;
  size: number;
  age: number;
  lifeMs: number;
}

export interface RenderZoneView {
  x: number;
  y: number;
  radius: number;
  targetX: number;
  targetY: number;
  targetRadius: number;
  shrinking: boolean;
}

export interface RenderSceneArgs {
  world: RenderWorldView;
  camera: RenderCameraView;
  players: RenderTankView[];
  enemies: RenderTankView[];
  bullets: RenderBulletView[];
  weaponPickups?: RenderWeaponPickupView[];
  zone?: RenderZoneView;
  powerUps?: PowerUp[];
  viewW: number;
  viewH: number;
  fog?: { x: number; y: number; radius: number } | null;
  weaponCharge?: { center: Vec2; dir: Dir; ratio: number; color: string } | null;
}

interface Explosion {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number; // 0..1
  kind: BulletKind;
}

interface Muzzle {
  x: number;
  y: number;
  life: number;
  color: string;
  kind: BulletKind;
  angle: number;
  power: number;
}

interface Beam {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  width: number;
  life: number;
  kind: 'chain' | 'laser';
  power: number;
}

/**
 * Canvas 渲染器。所有绘制逻辑集中在此，避免游戏逻辑掺杂渲染细节。
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private explosions: Explosion[] = [];
  private muzzles: Muzzle[] = [];
  private beams: Beam[] = [];
  private weaponVfx = new WeaponVfx();
  private trailPhase = 0;

  canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('无法获取 2D 上下文');
    this.ctx = c;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  addExplosion(x: number, y: number, r: number, color: string, kind: BulletKind = 'normal'): void {
    this.explosions.push({ x, y, r, color, life: 1, kind });
    this.weaponVfx.impact({ x, y }, r, kind, color);
  }

  addMuzzle(
    x: number,
    y: number,
    color: string,
    kind: BulletKind = 'normal',
    angle = -Math.PI / 2,
    power = 1,
  ): void {
    this.muzzles.push({ x, y, life: 1, color, kind, angle, power });
    this.weaponVfx.muzzle({ x, y }, kind, color, angle, power);
  }

  addBeam(
    from: Vec2,
    to: Vec2,
    color: string,
    width: number,
    kind: 'chain' | 'laser' = 'chain',
    power = 1,
  ): void {
    this.beams.push({ from: { ...from }, to: { ...to }, color, width, life: 1, kind, power });
    if (kind === 'laser') this.weaponVfx.laserRelease(from, to, color, power);
  }

  update(dt: number): void {
    this.trailPhase = (this.trailPhase + dt * 6) % (Math.PI * 2);
    for (const e of this.explosions) e.life -= dt * 1.6;
    this.explosions = this.explosions.filter((e) => e.life > 0);
    for (const m of this.muzzles) m.life -= dt * 8;
    this.muzzles = this.muzzles.filter((m) => m.life > 0);
    for (const beam of this.beams) beam.life -= dt * 7;
    this.beams = this.beams.filter((beam) => beam.life > 0);
    this.weaponVfx.update(dt);
  }

  draw(args: {
    world: World;
    camera: Camera;
    player: Player | null;
    enemies: Enemy[];
    bullets: Bullet[];
    powerUps: PowerUp[];
    viewW: number;
    viewH: number;
    fog?: { x: number; y: number; radius: number } | null;
    weaponCharge?: { center: Vec2; dir: Dir; ratio: number; color: string } | null;
  }): void {
    this.drawScene({
      ...args,
      players: args.player ? [args.player] : [],
    });
  }

  drawScene(args: RenderSceneArgs): void {
    const {
      world,
      camera,
      players,
      enemies,
      bullets,
      weaponPickups = [],
      powerUps = [],
      viewW,
      viewH,
    } = args;
    const ctx = this.ctx;

    // 背景
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    const shake = this.weaponVfx.shakeOffset();
    ctx.translate(-camera.x + shake.x, -camera.y + shake.y);

    // 世界外围
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-32, -32, world.widthPx + 64, world.heightPx + 64);
    // 世界底纹
    this.drawGrid(world, camera, viewW, viewH);

    // 静态 tile（brick, steel, water, ice, base）
    this.drawTiles(world, camera, viewW, viewH, false);

    // 道具
    for (const p of powerUps) if (p.alive) this.drawPowerUp(p);
    for (const pickup of weaponPickups) this.drawWeaponPickup(pickup);

    // 坦克（bush 之下）
    for (const e of enemies) if (e.alive) this.drawTank(e);
    for (const player of players) if (player.alive) this.drawTank(player);

    if (args.weaponCharge) this.weaponVfx.drawCharge(ctx, args.weaponCharge);

    // 子弹
    for (const b of bullets) if (b.alive) this.drawBullet(b);

    // bush 覆盖坦克与子弹（视野遮挡）
    this.drawTiles(world, camera, viewW, viewH, true);

    for (const beam of this.beams) this.drawBeam(beam);

    // 爆炸
    for (const ex of this.explosions) this.drawExplosion(ex);
    this.weaponVfx.draw(ctx);
    // 枪口闪光
    for (const m of this.muzzles) this.drawMuzzle(m);

    // 战争迷雾：径向遮罩，只保留焦点周围（世界坐标系内绘制）
    if (args.fog) this.drawFog(args.fog);
    if (args.zone) this.drawZone(args.zone, camera, viewW, viewH);

    ctx.restore();

    // 世界边框
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      Math.max(0, -camera.x) + 0.5,
      Math.max(0, -camera.y) + 0.5,
      Math.min(world.widthPx, viewW),
      Math.min(world.heightPx, viewH),
    );

    this.drawMinimap(world, camera, players, enemies, viewW, viewH, args.zone);
  }

  /** 在超出视口的地图上提供全局方位与当前镜头范围。 */
  private drawMinimap(
    world: RenderWorldView,
    camera: RenderCameraView,
    players: RenderTankView[],
    enemies: RenderTankView[],
    viewW: number,
    viewH: number,
    zone?: RenderZoneView,
  ): void {
    if (world.widthPx <= viewW && world.heightPx <= viewH) return;
    const ctx = this.ctx;
    const maxW = viewW < 640 ? 116 : 172;
    const maxH = viewH < 520 ? 82 : 124;
    const scale = Math.min(maxW / world.widthPx, maxH / world.heightPx);
    const mapW = world.widthPx * scale;
    const mapH = world.heightPx * scale;
    const x = viewW - mapW - 18;
    const y = viewH - mapH - 18;

    ctx.save();
    ctx.fillStyle = 'rgba(3, 8, 15, 0.88)';
    ctx.fillRect(x - 7, y - 22, mapW + 14, mapH + 29);
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 7.5, y - 22.5, mapW + 15, mapH + 30);
    ctx.fillStyle = 'rgba(186, 230, 253, 0.75)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillText('TACTICAL MAP', x, y - 8);

    const colors: Partial<Record<TileKind, string>> = {
      brick: '#9a4b16', steel: '#8492a6', water: '#1d4f91',
      bush: '#187044', ice: '#7dd3fc', base: '#facc15',
    };
    for (let row = 0; row < world.rows; row++) {
      for (let col = 0; col < world.cols; col++) {
        const color = colors[world.get(col, row)];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x + col * TILE * scale, y + row * TILE * scale, Math.max(1, TILE * scale), Math.max(1, TILE * scale));
      }
    }
    ctx.fillStyle = '#fb7185';
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const c = enemy.center;
      ctx.fillRect(x + c.x * scale - 1, y + c.y * scale - 1, 3, 3);
    }
    for (const player of players) {
      if (!player.alive) continue;
      const c = player.center;
      ctx.fillStyle = player.renderColor ?? '#4ade80';
      ctx.fillRect(x + c.x * scale - 2, y + c.y * scale - 2, 4, 4);
    }
    if (zone) {
      ctx.strokeStyle = zone.shrinking ? '#fb7185' : '#fda4af';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + zone.x * scale, y + zone.y * scale, zone.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      if (!zone.shrinking && zone.targetRadius < zone.radius) {
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.8)';
        ctx.beginPath();
        ctx.arc(
          x + zone.targetX * scale,
          y + zone.targetY * scale,
          zone.targetRadius * scale,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeRect(
      x + Math.max(0, camera.x) * scale,
      y + Math.max(0, camera.y) * scale,
      Math.min(viewW, world.widthPx) * scale,
      Math.min(viewH, world.heightPx) * scale,
    );
    ctx.restore();
  }

  /** 战争迷雾：以 focus 为中心画径向渐变遮罩，只保留一圈可视范围（世界坐标系内）。 */
  private drawFog(fog: { x: number; y: number; radius: number }): void {
    const ctx = this.ctx;
    const inner = fog.radius * 0.6;
    const grad = ctx.createRadialGradient(fog.x, fog.y, inner, fog.x, fog.y, fog.radius);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0.97)');
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(fog.x - fog.radius, fog.y - fog.radius, fog.radius * 2, fog.radius * 2);
    // 半径外全部涂黑（渐变只覆盖方形范围）
    ctx.fillStyle = 'rgba(2, 6, 23, 0.97)';
    ctx.beginPath();
    ctx.rect(fog.x - fog.radius, fog.y - fog.radius, fog.radius * 2, fog.radius * 2);
    ctx.rect(-1e5, -1e5, 2e5, 2e5);
    ctx.fill('evenodd');
    ctx.restore();
  }

  private drawGrid(world: RenderWorldView, camera: RenderCameraView, viewW: number, viewH: number): void {
    const ctx = this.ctx;
    const startCol = Math.max(0, Math.floor(camera.x / TILE));
    const endCol = Math.min(world.cols, Math.ceil((camera.x + viewW) / TILE));
    const startRow = Math.max(0, Math.floor(camera.y / TILE));
    const endRow = Math.min(world.rows, Math.ceil((camera.y + viewH) / TILE));
    ctx.strokeStyle = 'rgba(51,65,85,0.35)';
    ctx.lineWidth = 1;
    for (let c = startCol; c <= endCol; c++) {
      ctx.beginPath();
      ctx.moveTo(c * TILE + 0.5, startRow * TILE);
      ctx.lineTo(c * TILE + 0.5, endRow * TILE);
      ctx.stroke();
    }
    for (let r = startRow; r <= endRow; r++) {
      ctx.beginPath();
      ctx.moveTo(startCol * TILE, r * TILE + 0.5);
      ctx.lineTo(endCol * TILE, r * TILE + 0.5);
      ctx.stroke();
    }
  }

  private drawTiles(world: RenderWorldView, camera: RenderCameraView, viewW: number, viewH: number, onlyBush: boolean): void {
    const startCol = Math.max(0, Math.floor(camera.x / TILE));
    const endCol = Math.min(world.cols - 1, Math.ceil((camera.x + viewW) / TILE));
    const startRow = Math.max(0, Math.floor(camera.y / TILE));
    const endRow = Math.min(world.rows - 1, Math.ceil((camera.y + viewH) / TILE));
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const k = world.get(c, r);
        if (onlyBush) {
          if (k === 'bush') this.drawBush(c, r);
          continue;
        }
        if (k === 'brick') this.drawBrick(c, r);
        else if (k === 'steel') this.drawSteel(c, r);
        else if (k === 'water') this.drawWater(c, r);
        else if (k === 'ice') this.drawIce(c, r);
        else if (k === 'base') this.drawBase(c, r, world);
      }
    }
  }

  private drawBrick(c: number, r: number): void {
    const ctx = this.ctx;
    const x = c * TILE;
    const y = r * TILE;
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#78350f';
    // 砖缝
    const half = TILE / 2;
    ctx.fillRect(x, y + half - 1, TILE, 2);
    ctx.fillRect(x + half - 1, y, 2, half);
    ctx.fillRect(x + half / 2 - 1, y + half, 2, half);
    ctx.fillRect(x + half + half / 2 - 1, y + half, 2, half);
  }

  private drawSteel(c: number, r: number): void {
    const ctx = this.ctx;
    const x = c * TILE;
    const y = r * TILE;
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(x + 6, y + 6, TILE - 12, TILE - 12);
  }

  private drawWater(c: number, r: number): void {
    const ctx = this.ctx;
    const x = c * TILE;
    const y = r * TILE;
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const yy = y + 8 + i * 10 + Math.sin(this.trailPhase + c + i) * 1.5;
      ctx.moveTo(x + 4, yy);
      ctx.lineTo(x + TILE - 4, yy);
    }
    ctx.stroke();
  }

  private drawIce(c: number, r: number): void {
    const ctx = this.ctx;
    const x = c * TILE;
    const y = r * TILE;
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#93c5fd';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + TILE - 4, y + TILE - 4);
    ctx.moveTo(x + TILE - 4, y + 4);
    ctx.lineTo(x + 4, y + TILE - 4);
    ctx.stroke();
  }

  private drawBush(c: number, r: number): void {
    const ctx = this.ctx;
    const x = c * TILE;
    const y = r * TILE;
    ctx.fillStyle = 'rgba(22, 101, 52, 0.85)';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
    for (let i = 0; i < 6; i++) {
      const rx = x + ((i * 7 + c * 13) % TILE);
      const ry = y + ((i * 11 + r * 5) % TILE);
      ctx.fillRect(rx, ry, 4, 4);
    }
  }

  private drawBase(c: number, r: number, world: RenderWorldView): void {
    const baseCol = Math.floor(world.base.x / TILE);
    const baseRow = Math.floor(world.base.y / TILE);
    if (c !== baseCol || r !== baseRow) return;

    const ctx = this.ctx;
    const bx = world.base.x;
    const by = world.base.y;
    const size = TILE * 2;
    const cx = bx + size / 2;
    const cy = by + size / 2;
    const alive = world.baseAlive;
    const hpRatio = Math.max(0, Math.min(1, world.baseHp / Math.max(1, world.baseMaxHp)));
    const color = hpRatio > 0.66 ? '#facc15' : hpRatio > 0.33 ? '#f59e0b' : '#ef4444';

    ctx.save();
    ctx.fillStyle = '#050a12';
    ctx.fillRect(bx, by, size, size);
    ctx.fillStyle = alive ? '#1e293b' : '#171717';
    ctx.fillRect(bx + 3, by + 3, size - 6, size - 6);
    ctx.strokeStyle = alive ? '#64748b' : '#3f3f46';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 4, by + 4, size - 8, size - 8);

    const corners: Array<[number, number]> = [
      [bx + 7, by + 7],
      [bx + size - 20, by + 7],
      [bx + 7, by + size - 20],
      [bx + size - 20, by + size - 20],
    ];
    for (const [x, y] of corners) {
      ctx.fillStyle = alive ? '#334155' : '#262626';
      ctx.fillRect(x, y, 13, 13);
      ctx.strokeStyle = alive ? '#94a3b8' : '#52525b';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, 12, 12);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 5, y + 5, 3, 3);
    }

    ctx.fillStyle = alive ? '#0f172a' : '#101010';
    ctx.fillRect(bx + 13, by + 13, size - 26, size - 26);
    ctx.strokeStyle = alive ? '#475569' : '#404040';
    ctx.strokeRect(bx + 13.5, by + 13.5, size - 27, size - 27);

    if (alive) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.moveTo(cx, by + 15);
      ctx.lineTo(bx + size - 16, by + 25);
      ctx.lineTo(bx + size - 19, by + 44);
      ctx.lineTo(cx, by + size - 14);
      ctx.lineTo(bx + 19, by + 44);
      ctx.lineTo(bx + 16, by + 25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, by + 21);
      ctx.lineTo(cx + 10, cy - 3);
      ctx.lineTo(cx + 6, cy + 10);
      ctx.lineTo(cx, cy + 15);
      ctx.lineTo(cx - 6, cy + 10);
      ctx.lineTo(cx - 10, cy - 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cx - 2, by + 27, 4, 13);
      ctx.restore();
    } else {
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#71717a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 13, cy - 12);
      ctx.lineTo(cx + 12, cy + 13);
      ctx.moveTo(cx + 12, cy - 12);
      ctx.lineTo(cx - 13, cy + 13);
      ctx.stroke();
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(bx + 9, by + 29, 12, 7);
      ctx.fillRect(bx + 44, by + 18, 10, 8);
      ctx.fillRect(bx + 38, by + 47, 14, 6);
    }

    ctx.fillStyle = '#020617';
    ctx.fillRect(bx + 9, by + size - 10, size - 18, 5);
    ctx.fillStyle = alive ? color : '#3f3f46';
    ctx.fillRect(bx + 10, by + size - 9, (size - 20) * hpRatio, 3);

    if (world.baseInvulnMs > 0) {
      const pulse = 0.5 + Math.sin(world.baseInvulnMs * 0.012) * 0.25;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.strokeRect(bx - 2.5, by - 2.5, size + 5, size + 5);
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 1.5, by + 1.5, size - 3, size - 3);
    }
    ctx.restore();
  }

  private drawTank(t: RenderTankView): void {
    const ctx = this.ctx;
    const { x, y, w, h } = t.rect;
    const cx = x + w / 2;

    if (t.team === 'enemy') {
      drawEnemyTankVisual(ctx, t);
    } else {
      drawPlayerTankVisual(ctx, t);
    }

    // 冻结
    if (t.freezeMs > 0) {
      ctx.fillStyle = 'rgba(191,219,254,0.55)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#dbeafe';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    if (t.burnMs > 0) {
      ctx.save();
      ctx.globalAlpha = 0.65 + Math.sin(t.age * 16) * 0.2;
      ctx.fillStyle = '#fb7185';
      for (let i = 0; i < 4; i++) {
        const fx = x + 12 + ((i * 13) % Math.max(1, w - 24));
        const fy = y + h - 8 - ((i + Math.floor(t.age * 8)) % 3) * 7;
        ctx.beginPath();
        ctx.arc(fx, fy, 4 + (i % 2) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 无敌闪烁
    if (t.invulnMs > 0 && Math.floor(t.age * 12) % 2 === 0) {
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    // HP 条（超过 1 时显示）
    if (t.maxHp > 1) {
      const barW = w;
      const barH = 3;
      ctx.fillStyle = '#111827';
      ctx.fillRect(x, y - 6, barW, barH);
      ctx.fillStyle = t.team === 'player' ? '#22c55e' : '#ef4444';
      ctx.fillRect(x, y - 6, (barW * t.hp) / t.maxHp, barH);
    }
    if (t.local) {
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    }
    if (t.label) {
      ctx.fillStyle = t.renderColor ?? '#f8fafc';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.label, cx, y - 11);
      ctx.textAlign = 'start';
    }
  }

  private drawBullet(b: RenderBulletView): void {
    const ctx = this.ctx;
    const c = b.center;
    const r = b.spec.size;
    const angle = Math.atan2(b.vy, b.vx);
    const speed = Math.hypot(b.vx, b.vy);
    const trail = Math.min(64, 10 + speed * 0.055);
    const phase = b.age * 18 + this.trailPhase;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(angle);
    ctx.shadowColor = b.spec.glow;
    ctx.shadowBlur = b.spec.visual === 'rail' || b.spec.visual === 'laser' ? 22 : 12;
    ctx.fillStyle = b.spec.color;

    switch (b.spec.visual) {
      case 'orb': {
        ctx.globalAlpha = 0.18;
        ctx.fillRect(-trail, -r * 0.7, trail, r * 1.4);
        for (let i = 1; i <= 4; i++) {
          ctx.globalAlpha = 0.5 - i * 0.09;
          ctx.beginPath();
          ctx.arc(-i * r * 1.8, Math.sin(phase + i) * 1.5, Math.max(0.8, r * (0.8 - i * 0.12)), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r * 0.2, -r * 0.18, r * 0.58, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = b.spec.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'streak':
        for (let i = 4; i >= 0; i--) {
          ctx.globalAlpha = 0.12 + (4 - i) * 0.14;
          ctx.fillRect(-r * (3 + i * 2.2), -r * (0.9 - i * 0.1), r * 3.2, r * (1.8 - i * 0.2));
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-r * 1.3, -r * 0.42, r * 3.8, r * 0.84);
        ctx.fillStyle = b.spec.color;
        ctx.fillRect(-r * 0.4, -r, r * 2.8, r * 2);
        break;
      case 'shell': {
        for (let i = 1; i <= 5; i++) {
          ctx.globalAlpha = 0.28 - i * 0.035;
          ctx.fillStyle = i % 2 === 0 ? '#64748b' : '#cbd5e1';
          ctx.beginPath();
          ctx.arc(-r * (1.3 + i * 1.15), Math.sin(phase * 0.7 + i) * r * 0.55, r * (0.48 + i * 0.1), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.spec.color;
        ctx.beginPath();
        ctx.moveTo(r * 1.9, 0);
        ctx.lineTo(r * 0.3, -r);
        ctx.lineTo(-r * 1.5, -r * 0.78);
        ctx.lineTo(-r * 1.75, r * 0.78);
        ctx.lineTo(r * 0.3, r);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff7ed';
        ctx.fillRect(-r * 0.1, -r * 0.46, r * 1.25, r * 0.92);
        break;
      }
      case 'needle': {
        const gradient = ctx.createLinearGradient(-trail, 0, r * 3, 0);
        gradient.addColorStop(0, 'rgba(167,139,250,0)');
        gradient.addColorStop(0.72, b.spec.color);
        gradient.addColorStop(1, '#ffffff');
        ctx.fillStyle = gradient;
        ctx.fillRect(-trail, -r * 0.42, trail + r * 3.5, r * 0.84);
        ctx.strokeStyle = b.spec.color;
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
          const x = -i * r * 3.6;
          ctx.globalAlpha = 0.7 - i * 0.16;
          ctx.beginPath();
          ctx.moveTo(x + r * 1.2, 0);
          ctx.lineTo(x - r, -r * 1.2);
          ctx.moveTo(x + r * 1.2, 0);
          ctx.lineTo(x - r, r * 1.2);
          ctx.stroke();
        }
        break;
      }
      case 'pulse': {
        const pulse = 1 + Math.sin(phase) * 0.14;
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = b.spec.color;
        for (let i = 1; i <= 4; i++) {
          ctx.beginPath();
          ctx.arc(-i * r * 1.8, 0, r * (1.2 - i * 0.16), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.rotate(phase * 0.12);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, r * (1.45 + i * 0.18) * pulse, i * Math.PI / 2, i * Math.PI / 2 + 0.72);
          ctx.stroke();
        }
        ctx.fillStyle = b.spec.color;
        ctx.beginPath();
        ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff1f2';
        ctx.beginPath();
        ctx.arc(r * 0.2, -r * 0.2, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'wave': {
        ctx.strokeStyle = b.spec.color;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          ctx.globalAlpha = 0.18 + i * 0.15;
          ctx.lineWidth = 1 + i * 0.8;
          const x = -trail * (1 - i * 0.21);
          ctx.beginPath();
          ctx.arc(x, 0, r * (2.6 - i * 0.35), -0.8, 0.8);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ecfeff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'pellet': {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = b.spec.color;
        ctx.beginPath();
        ctx.moveTo(-trail, -r * 2.2);
        ctx.lineTo(r, 0);
        ctx.lineTo(-trail, r * 2.2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = i === 0 ? '#ffffff' : b.spec.color;
          ctx.beginPath();
          ctx.arc(i * r * 0.4, i * r * 0.95, r * (i === 0 ? 0.78 : 0.62), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'diamond': {
        for (let i = 1; i <= 5; i++) {
          const x = -i * r * 1.55;
          ctx.globalAlpha = 0.42 - i * 0.055;
          ctx.fillStyle = i % 2 ? b.spec.color : '#cffafe';
          ctx.beginPath();
          ctx.arc(x, Math.sin(phase * 0.7 + i) * r, r * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.spec.color;
        ctx.beginPath();
        ctx.moveTo(r * 1.8, 0);
        ctx.lineTo(0, -r);
        ctx.lineTo(-r * 1.3, 0);
        ctx.lineTo(0, r);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r * 0.55, 0, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b.spec.color;
        ctx.fillRect(-r * 0.8, -r * 1.55, r * 0.85, r * 0.55);
        ctx.fillRect(-r * 0.8, r, r * 0.85, r * 0.55);
        break;
      }
      case 'prism': {
        const rainbow = ['#f0abfc', '#93c5fd', '#86efac'];
        for (let i = 3; i >= 1; i--) {
          ctx.globalAlpha = 0.12 + i * 0.08;
          ctx.fillStyle = rainbow[i - 1];
          ctx.beginPath();
          ctx.moveTo(-i * r * 2 + r, 0);
          ctx.lineTo(-i * r * 2, -r);
          ctx.lineTo(-i * r * 2 - r, 0);
          ctx.lineTo(-i * r * 2, r);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.rotate(phase * 0.17);
        ctx.fillStyle = b.spec.color;
        ctx.beginPath();
        ctx.moveTo(r * 1.65, 0);
        ctx.lineTo(0, -r * 1.25);
        ctx.lineTo(-r * 1.65, 0);
        ctx.lineTo(0, r * 1.25);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      }
      case 'crystal': {
        ctx.strokeStyle = '#dbeafe';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 5; i++) {
          const x = -i * r * 1.8;
          const y = Math.sin(phase + i * 2) * r * 1.35;
          ctx.globalAlpha = 0.58 - i * 0.07;
          ctx.beginPath();
          ctx.moveTo(x - r * 0.55, y);
          ctx.lineTo(x + r * 0.55, y);
          ctx.moveTo(x, y - r * 0.55);
          ctx.lineTo(x, y + r * 0.55);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.spec.color;
        ctx.beginPath();
        ctx.moveTo(r * 1.8, 0);
        ctx.lineTo(r * 0.4, -r);
        ctx.lineTo(-r, -r * 0.6);
        ctx.lineTo(-r * 1.3, r * 0.5);
        ctx.lineTo(r * 0.3, r);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        break;
      }
      case 'laser': {
        const gradient = ctx.createLinearGradient(-trail, 0, r * 4, 0);
        gradient.addColorStop(0, 'rgba(240,171,252,0)');
        gradient.addColorStop(0.55, b.spec.color);
        gradient.addColorStop(1, '#ffffff');
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(-trail, -r * 1.4, trail + r * 4, r * 2.8);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-r * 4, -r * 0.35, r * 8, r * 0.7);
        ctx.fillStyle = b.spec.color;
        ctx.fillRect(-r * 2, -r, r * 5, r * 2);
        break;
      }
      case 'plasma': {
        for (let i = 5; i >= 1; i--) {
          ctx.globalAlpha = 0.12 + (5 - i) * 0.05;
          ctx.fillStyle = i % 2 ? b.spec.color : '#fda4af';
          ctx.beginPath();
          ctx.arc(-i * r * 1.15, Math.sin(phase * 0.8 + i) * r * 0.8, r * (0.45 + i * 0.08), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = b.spec.color;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i === 2 ? '#ffffff' : b.spec.color;
          ctx.beginPath();
          ctx.arc(-i * r * 0.22, Math.sin(phase + i) * r * 0.22, r * (1 - i * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#fecdd3';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.28, phase * 0.3, phase * 0.3 + Math.PI * 1.35);
        ctx.stroke();
        break;
      }
      case 'arc': {
        ctx.globalAlpha = 0.26;
        ctx.strokeStyle = b.spec.color;
        ctx.lineWidth = r * 1.5;
        ctx.beginPath();
        ctx.moveTo(-trail, 0);
        for (let i = 1; i < 7; i++) {
          const t = i / 7;
          ctx.lineTo(-trail + trail * t, Math.sin(phase + i * 5.1) * r * 1.3);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(-r * 2.2, 0);
        ctx.lineTo(-r * 1.3, -r * 1.2);
        ctx.lineTo(-r * 0.35, r * 0.8);
        ctx.lineTo(r * 0.55, -r * 0.7);
        ctx.lineTo(r * 1.8, 0);
        ctx.stroke();
        ctx.fillStyle = b.spec.color;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rail': {
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-trail, -r * 2.3, trail + r * 3, r * 4.6);
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
          const x = -i * r * 4;
          ctx.beginPath();
          ctx.arc(x, 0, r * (1.3 + i * 0.22), phase * 0.35 + i, phase * 0.35 + i + Math.PI * 1.25);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-r * 5, -r * 0.42, r * 9, r * 0.84);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-r * 2, -r * 1.15, r * 6.5, r * 0.6);
        ctx.fillRect(-r * 2, r * 0.55, r * 6.5, r * 0.6);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(r * 4.8, 0);
        ctx.lineTo(r * 2.4, -r * 0.85);
        ctx.lineTo(r * 2.4, r * 0.85);
        ctx.closePath();
        ctx.fill();
        break;
      }
      default:
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
  }

  private drawExplosion(ex: Explosion): void {
    const ctx = this.ctx;
    const progress = 1 - ex.life;
    const radius = ex.r * (0.35 + progress * 1.35);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, ex.life);
    ctx.shadowColor = ex.color;
    ctx.shadowBlur = Math.min(30, ex.r * 0.45);

    if (ex.kind !== 'shockwave' && ex.kind !== 'pierce' && ex.kind !== 'railgun') {
      const grd = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, radius);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.18, ex.color);
      grd.addColorStop(0.62, colorWithAlpha(ex.color, 0.38));
      grd.addColorStop(1, colorWithAlpha(ex.color, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = ex.color;
    ctx.lineWidth = Math.max(1, ex.r * 0.08);
    ctx.globalAlpha = Math.max(0, ex.life * 0.9);
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.r * (0.25 + progress * 1.1), 0, Math.PI * 2);
    ctx.stroke();

    if (ex.kind === 'explosive' || ex.kind === 'heavy' || ex.kind === 'plasma') {
      const rays = ex.kind === 'explosive' ? 14 : 9;
      for (let i = 0; i < rays; i++) {
        const a = (Math.PI * 2 * i) / rays + progress * 0.7;
        const inner = ex.r * (0.18 + (i % 3) * 0.05);
        const outer = ex.r * (0.72 + (i % 4) * 0.16) * (0.7 + progress * 0.45);
        ctx.lineWidth = 1 + (i % 3);
        ctx.beginPath();
        ctx.moveTo(ex.x + Math.cos(a) * inner, ex.y + Math.sin(a) * inner);
        ctx.lineTo(ex.x + Math.cos(a) * outer, ex.y + Math.sin(a) * outer);
        ctx.stroke();
      }
    } else if (ex.kind === 'freeze') {
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
        const inner = ex.r * 0.14;
        const outer = ex.r * (0.72 + progress * 0.48);
        ctx.beginPath();
        ctx.moveTo(ex.x + Math.cos(a) * inner, ex.y + Math.sin(a) * inner);
        ctx.lineTo(ex.x + Math.cos(a) * outer, ex.y + Math.sin(a) * outer);
        const branch = outer * 0.72;
        ctx.lineTo(ex.x + Math.cos(a - 0.22) * branch, ex.y + Math.sin(a - 0.22) * branch);
        ctx.moveTo(ex.x + Math.cos(a) * outer, ex.y + Math.sin(a) * outer);
        ctx.lineTo(ex.x + Math.cos(a + 0.22) * branch, ex.y + Math.sin(a + 0.22) * branch);
        ctx.stroke();
      }
    } else if (ex.kind === 'chain') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        ctx.beginPath();
        ctx.moveTo(ex.x, ex.y);
        ctx.lineTo(ex.x + Math.cos(a + 0.18) * ex.r * 0.45, ex.y + Math.sin(a + 0.18) * ex.r * 0.45);
        ctx.lineTo(ex.x + Math.cos(a - 0.12) * ex.r * 1.1, ex.y + Math.sin(a - 0.12) * ex.r * 1.1);
        ctx.stroke();
      }
    } else if (ex.kind === 'bounce') {
      ctx.translate(ex.x, ex.y);
      ctx.rotate(progress * 2.4);
      ctx.strokeRect(-radius * 0.65, -radius * 0.65, radius * 1.3, radius * 1.3);
    } else if (ex.kind === 'pierce' || ex.kind === 'railgun' || ex.kind === 'laser') {
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = ex.life * (0.75 - i * 0.12);
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, ex.r * (0.25 + i * 0.3 + progress * 0.45), i * 0.7, Math.PI + i * 0.7);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawMuzzle(m: Muzzle): void {
    const ctx = this.ctx;
    const size = (6 + m.power * 7) * m.life;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, m.life);
    ctx.fillStyle = m.color;
    ctx.strokeStyle = m.color;
    ctx.shadowColor = m.color;
    ctx.shadowBlur = 16;
    if (m.kind === 'spread') {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size * 2.1, -size * 0.9);
      ctx.lineTo(size * 1.5, 0);
      ctx.lineTo(size * 2.1, size * 0.9);
      ctx.closePath();
      ctx.fill();
    } else if (m.kind === 'heavy' || m.kind === 'explosive' || m.kind === 'shockwave') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10;
        const rr = i % 2 === 0 ? size * 1.7 : size * 0.62;
        const x = Math.cos(a) * rr + size * 0.5;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === 'railgun' || m.kind === 'pierce' || m.kind === 'laser') {
      ctx.lineWidth = Math.max(1, size * 0.22);
      ctx.beginPath();
      ctx.moveTo(-size * 0.65, 0);
      ctx.lineTo(size * 2.6, 0);
      ctx.stroke();
      ctx.globalAlpha *= 0.7;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.9);
      ctx.lineTo(size * 1.4, 0);
      ctx.lineTo(0, size * 0.9);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === 'freeze') {
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * size * 1.45, Math.sin(a) * size * 1.45);
        ctx.stroke();
      }
    } else if (m.kind === 'chain') {
      ctx.lineWidth = 2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(size * 0.7, side * size * 0.65);
        ctx.lineTo(size * 1.45, side * size * 0.2);
        ctx.lineTo(size * 2.1, side * size * 0.72);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(size * 0.5, 0);
      ctx.lineTo(size * 2, -size * 0.45);
      ctx.lineTo(size * 1.6, 0);
      ctx.lineTo(size * 2, size * 0.45);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBeam(beam: Beam): void {
    const ctx = this.ctx;
    const dx = beam.to.x - beam.from.x;
    const dy = beam.to.y - beam.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, beam.life);
    ctx.shadowColor = beam.color;
    if (beam.kind === 'laser') {
      const pulse = 0.75 + Math.sin(this.trailPhase * 4) * 0.25;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 28 + beam.power * 20;
      ctx.strokeStyle = beam.color;
      ctx.globalAlpha = beam.life * 0.28;
      ctx.lineWidth = beam.width * (4 + beam.power * 2.5);
      ctx.beginPath();
      ctx.moveTo(beam.from.x, beam.from.y);
      ctx.lineTo(beam.to.x, beam.to.y);
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, beam.life * 1.25);
      ctx.lineWidth = beam.width * (1.6 + beam.power * 0.8) * pulse;
      ctx.strokeStyle = beam.color;
      ctx.stroke();
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, beam.width * 0.42);
      ctx.stroke();
      const nodes = Math.min(30, Math.max(8, Math.round(len / 48)));
      ctx.fillStyle = '#ffffff';
      for (let i = 1; i < nodes; i++) {
        const t = i / nodes;
        const offset = Math.sin(i * 4.7 + this.trailPhase * 7) * beam.width * 1.8;
        ctx.globalAlpha = beam.life * (0.35 + (i % 3) * 0.18);
        ctx.beginPath();
        ctx.arc(beam.from.x + dx * t + nx * offset, beam.from.y + dy * t + ny * offset, 1 + beam.power, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.shadowBlur = 16;
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = beam.width + 4;
      ctx.globalAlpha = beam.life * 0.28;
      ctx.beginPath();
      ctx.moveTo(beam.from.x, beam.from.y);
      for (let i = 1; i < 9; i++) {
        const t = i / 9;
        const jitter = Math.sin(i * 7.13 + this.trailPhase * 9) * 9 * beam.life;
        ctx.lineTo(beam.from.x + dx * t + nx * jitter, beam.from.y + dy * t + ny * jitter);
      }
      ctx.lineTo(beam.to.x, beam.to.y);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, beam.width * 0.42);
      ctx.globalAlpha = Math.min(1, beam.life * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPowerUp(p: PowerUp): void {
    const ctx = this.ctx;
    const { x, y, w, h } = p.rect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pulse = 1 + Math.sin(p.age * 6) * 0.08;
    ctx.save();
    // 底盘
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, (w / 2) * pulse, 0, Math.PI * 2);
    ctx.fill();
    // 图标色
    const color = powerUpColor(p.kind);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(powerUpLabel(p.kind), cx, cy + 1);
    // 剩余时间闪烁
    if (p.lifeMs < 3000 && Math.floor(p.age * 6) % 2 === 0) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawWeaponPickup(pickup: RenderWeaponPickupView): void {
    const ctx = this.ctx;
    const life = pickup.kind === 'life';
    const spec = life ? null : BULLET_SPECS[pickup.kind as BulletKind];
    const color = life ? '#fb7185' : spec!.color;
    const pulse = 1 + Math.sin(pickup.age * 7) * 0.08;
    const radius = pickup.size * 0.5 * pulse;
    ctx.save();
    if (pickup.lifeMs < 3000 && Math.floor(pickup.age * 7) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(3, 9, 18, 0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = life ? '900 12px system-ui, sans-serif' : '900 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(life ? '+1' : spec!.name.slice(0, 1), pickup.x, pickup.y + 1);
    ctx.restore();
  }

  private drawZone(
    zone: RenderZoneView,
    camera: RenderCameraView,
    viewW: number,
    viewH: number,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(127, 29, 29, 0.18)';
    ctx.beginPath();
    ctx.rect(camera.x, camera.y, viewW, viewH);
    ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = zone.shrinking ? '#fb7185' : '#fda4af';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
    ctx.stroke();
    if (!zone.shrinking && zone.targetRadius < zone.radius) {
      ctx.setLineDash([12, 8]);
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.8)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(zone.targetX, zone.targetY, zone.targetRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function colorWithAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!hex) return color;
  return `rgba(${parseInt(hex[1], 16)},${parseInt(hex[2], 16)},${parseInt(hex[3], 16)},${alpha})`;
}

function powerUpColor(k: string): string {
  switch (k) {
    case 'star':
      return '#fde047';
    case 'shield':
      return '#60a5fa';
    case 'life':
      return '#f87171';
    case 'bomb':
      return '#fb923c';
    case 'freezeAll':
      return '#bfdbfe';
    default:
      return '#e2e8f0';
  }
}
function powerUpLabel(k: string): string {
  switch (k) {
    case 'star':
      return '★';
    case 'shield':
      return '盾';
    case 'life':
      return '♥';
    case 'bomb':
      return '炸';
    case 'freezeAll':
      return '冻';
    default:
      return '?';
  }
}
