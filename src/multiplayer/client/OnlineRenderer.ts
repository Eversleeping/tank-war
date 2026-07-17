import { BULLET_SPECS } from '../../game/BulletTypes.ts';
import type { BulletKind } from '../../game/BulletKind.ts';
import { Camera } from '../../game/Camera.ts';
import { TILE } from '../../game/constants.ts';
import { combatViewport, positionCombatCanvas } from '../../game/viewport.ts';
import { ENEMY_PROFILES, type EnemyKind } from '../../game/entities/Enemy.ts';
import {
  Renderer,
  type RenderBulletView,
  type RenderTankView,
  type RenderWorldView,
} from '../../game/Renderer.ts';
import type { Team, TileKind } from '../../game/types.ts';
import type {
  OnlineEnemyState,
  OnlineMode,
  OnlinePlayerState,
  OnlineSnapshot,
  OnlineWorldState,
} from '../protocol.ts';

export class OnlineRenderer {
  private renderer: Renderer;
  private world: SnapshotWorld | null = null;
  private camera: Camera | null = null;
  private viewW = 1280;
  private viewH = 720;
  private mode: OnlineMode | null = null;
  private windowW = 1280;
  private windowH = 720;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(width: number, height: number): void {
    this.windowW = Math.max(320, Math.floor(width));
    this.windowH = Math.max(240, Math.floor(height));
    const viewport = combatViewport(this.windowW, this.windowH, this.mode !== null);
    this.viewW = viewport.viewW;
    this.viewH = viewport.viewH;
    positionCombatCanvas(this.renderer.canvas, viewport);
    this.renderer.resize(this.viewW, this.viewH);
    if (this.camera && this.world) {
      this.camera.resize(this.viewW, this.viewH, this.world.widthPx, this.world.heightPx);
    }
  }

  dispose(): void {
    const canvas = this.renderer.canvas;
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.right = '0';
    canvas.style.bottom = '0';
  }

  addMuzzle(
    x: number,
    y: number,
    color: string,
    kind: BulletKind = 'normal',
    angle = -Math.PI / 2,
  ): void {
    this.renderer.addMuzzle(x, y, color, kind, angle);
  }

  addExplosion(x: number, y: number, radius: number, color: string): void {
    this.renderer.addExplosion(x, y, radius, color);
  }

  addWeaponImpact(
    x: number,
    y: number,
    radius: number,
    kind: BulletKind,
  ): void {
    const spec = BULLET_SPECS[kind];
    this.renderer.addExplosion(x, y, Math.max(20, radius), spec.color, kind);
  }

  addDestroyed(x: number, y: number, radius: number, color: string): void {
    this.renderer.addExplosion(x, y, radius, color, 'explosive');
  }

  addBeam(
    from: { x: number; y: number },
    to: { x: number; y: number },
    kind: BulletKind,
    width: number,
  ): void {
    const spec = BULLET_SPECS[kind];
    this.renderer.addBeam(
      from,
      to,
      spec.color,
      width,
      kind === 'laser' ? 'laser' : 'chain',
    );
  }

  isVisible(x: number, y: number, padding = 96): boolean {
    if (!this.camera) return false;
    return x >= this.camera.x - padding
      && x <= this.camera.x + this.viewW + padding
      && y >= this.camera.y - padding
      && y <= this.camera.y + this.viewH + padding;
  }

  draw(snapshot: OnlineSnapshot | null, playerId: string, dt: number): void {
    this.renderer.update(dt);
    if (snapshot && snapshot.mode !== this.mode) {
      this.mode = snapshot.mode;
      this.resize(this.windowW, this.windowH);
    }
    if (snapshot?.world) this.updateWorld(snapshot.world, snapshot);
    if (!snapshot || !this.world) return;
    this.world.updateMeta(snapshot);

    const players = snapshot.players.map((player) => this.playerView(player, snapshot, playerId));
    const local = players.find((player) => player.local && player.alive)
      ?? players.find((player) => player.alive);
    if (!this.camera) {
      this.camera = new Camera(this.viewW, this.viewH, this.world.widthPx, this.world.heightPx);
      if (local) this.camera.snap(local.center);
    } else if (local) {
      this.camera.follow(local.center);
    }

    this.renderer.drawScene({
      world: this.world,
      camera: this.camera,
      players,
      enemies: snapshot.enemies.map((enemy) => this.enemyView(enemy, snapshot.elapsedMs)),
      bullets: snapshot.bullets.map((bullet) => ({
        center: { x: bullet.x, y: bullet.y },
        vx: bullet.vx,
        vy: bullet.vy,
        spec: BULLET_SPECS[bullet.kind],
        age: bullet.age,
        alive: true,
      } satisfies RenderBulletView)),
      weaponPickups: snapshot.weaponPickups,
      zone: snapshot.zone,
      viewW: this.viewW,
      viewH: this.viewH,
    });
  }

  private updateWorld(state: OnlineWorldState, snapshot: OnlineSnapshot): void {
    if (this.world?.version === state.version) return;
    const resetCamera = requiresCameraReset(this.world, state);
    this.world = new SnapshotWorld(state, snapshot);
    if (resetCamera) {
      this.camera = null;
    } else if (this.camera) {
      this.camera.resize(this.viewW, this.viewH, this.world.widthPx, this.world.heightPx);
    }
  }

  private playerView(
    player: OnlinePlayerState,
    snapshot: OnlineSnapshot,
    playerId: string,
  ): RenderTankView {
    return {
      rect: { x: player.x, y: player.y, w: player.w, h: player.h },
      center: { x: player.x + player.w / 2, y: player.y + player.h / 2 },
      dir: player.dir,
      team: snapshot.mode === 'duo' ? 'player' : `online:${player.id}` as Team,
      hp: player.hp,
      maxHp: player.maxHp,
      alive: player.alive,
      invulnMs: player.invulnMs,
      freezeMs: player.freezeMs,
      burnMs: player.burnMs,
      age: snapshot.elapsedMs / 1000,
      moveDist: snapshot.elapsedMs * 0.16,
      renderColor: player.color,
      currentBullet: player.weapon,
      weaponLevel: player.bulletLevels[player.weapon] ?? 1,
      label: player.name,
      local: player.id === playerId,
    };
  }

  private enemyView(enemy: OnlineEnemyState, elapsedMs: number): RenderTankView {
    const kind = enemy.kind in ENEMY_PROFILES ? enemy.kind as EnemyKind : 'scout';
    return {
      rect: { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h },
      center: { x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h / 2 },
      dir: enemy.dir,
      team: 'enemy',
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      alive: enemy.alive,
      invulnMs: enemy.invulnMs,
      freezeMs: enemy.freezeMs,
      burnMs: enemy.burnMs,
      age: elapsedMs / 1000,
      moveDist: elapsedMs * 0.12,
      profile: ENEMY_PROFILES[kind],
      visualTier: enemy.rank,
    };
  }
}

export function requiresCameraReset(
  previous: Pick<OnlineWorldState, 'version' | 'cols' | 'rows'> | null,
  next: Pick<OnlineWorldState, 'version' | 'cols' | 'rows'>,
): boolean {
  if (!previous || previous.cols !== next.cols || previous.rows !== next.rows) return true;
  return Math.floor(previous.version / 1_000_000) !== Math.floor(next.version / 1_000_000);
}

class SnapshotWorld implements RenderWorldView {
  readonly version: number;
  readonly cols: number;
  readonly rows: number;
  readonly tiles: TileKind[];
  readonly base: { x: number; y: number };
  baseHp: number;
  baseMaxHp: number;
  baseAlive: boolean;
  baseInvulnMs: number;

  constructor(state: OnlineWorldState, snapshot: OnlineSnapshot) {
    this.version = state.version;
    this.cols = state.cols;
    this.rows = state.rows;
    this.tiles = [...state.tiles];
    this.base = { x: state.baseX, y: state.baseY };
    this.baseHp = snapshot.baseHp;
    this.baseMaxHp = snapshot.baseMaxHp;
    this.baseAlive = snapshot.baseHp > 0;
    this.baseInvulnMs = snapshot.baseInvulnMs;
  }

  get widthPx(): number {
    return this.cols * TILE;
  }

  get heightPx(): number {
    return this.rows * TILE;
  }

  get(col: number, row: number): TileKind {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 'steel';
    return this.tiles[row * this.cols + col];
  }

  updateMeta(snapshot: OnlineSnapshot): void {
    this.baseHp = snapshot.baseHp;
    this.baseMaxHp = snapshot.baseMaxHp;
    this.baseAlive = snapshot.baseHp > 0;
    this.baseInvulnMs = snapshot.baseInvulnMs;
  }
}
