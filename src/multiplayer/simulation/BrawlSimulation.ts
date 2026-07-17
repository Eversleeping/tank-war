import {
  BRAWL_INITIAL_LIVES,
  BRAWL_ZONE_SHRINK_MS,
  BRAWL_ZONE_WAIT_MS,
} from '../protocol.ts';
import type { OnlinePickupKind, OnlineWeaponPickupState, OnlineZoneState } from '../protocol.ts';
import { rollPickupChoices } from '../../game/BulletTypes.ts';
import { TANK_SIZE, TILE } from '../../game/constants.ts';
import type { Enemy } from '../../game/entities/Enemy.ts';
import { clamp, distance, rectsOverlap, type TileKind } from '../../game/types.ts';
import { createBrawlWorld, brawlSpawnPoints } from './maps.ts';
import { BaseSimulation, type SnapshotMeta } from './BaseSimulation.ts';
import { OnlineTank } from './OnlineTank.ts';
import { mulberry32 } from './combat.ts';
import type { OnlineParticipant } from './types.ts';

const ZONE_FACTORS = [0.72, 0.52, 0.36, 0.23, 0.13, 0.035] as const;

export class BrawlSimulation extends BaseSimulation {
  private readonly rng: () => number;
  private weaponPickups: OnlineWeaponPickupState[] = [];
  private nextPickupId = 1;
  private resourceSpawnMs = 0;
  private zoneX = 0;
  private zoneY = 0;
  private zoneRadius = 0;
  private zoneStartX = 0;
  private zoneStartY = 0;
  private zoneStartRadius = 0;
  private zoneTargetX = 0;
  private zoneTargetY = 0;
  private zoneTargetRadius = 0;
  private zonePhase = 0;
  private zoneShrinking = false;
  private zoneTimerMs = BRAWL_ZONE_WAIT_MS;

  constructor(participants: OnlineParticipant[], seed = Date.now()) {
    const rng = mulberry32(seed >>> 0);
    let tileDestroyed: (col: number, row: number, kind: TileKind) => void = () => undefined;
    const world = createBrawlWorld(rng, {
      onTileDestroyed: (col, row, kind) => tileDestroyed(col, row, kind),
    });
    super('brawl', participants, world, brawlSpawnPoints(world));
    this.rng = rng;
    for (const player of this.players) player.lives = BRAWL_INITIAL_LIVES;
    this.zoneX = world.widthPx / 2;
    this.zoneY = world.heightPx / 2;
    this.zoneRadius = Math.hypot(world.widthPx, world.heightPx) / 2 + TILE;
    this.zoneStartX = this.zoneTargetX = this.zoneX;
    this.zoneStartY = this.zoneTargetY = this.zoneY;
    this.zoneStartRadius = this.zoneTargetRadius = this.zoneRadius;
    this.prepareNextZoneTarget();
    for (let i = 0; i < 18; i++) this.spawnRandomResource();
    this.resourceSpawnMs = 8000 + this.rng() * 7000;
    tileDestroyed = (col, row, kind) => this.onTileDestroyed(col, row, kind);
  }

  protected beforeBullets(dt: number): void {
    this.updateZone(dt);
    this.applyZoneDamage(dt);
  }

  protected afterStep(dt: number): void {
    this.updateWeaponPickups(dt);
    this.resourceSpawnMs -= dt * 1000;
    if (this.resourceSpawnMs <= 0) {
      this.spawnRandomResource();
      this.resourceSpawnMs = 8000 + this.rng() * 7000;
    }
    const contenders = this.players.filter((player) => player.alive || player.lives > 0);
    if (contenders.length === 1 && this.players.length > 1) {
      this.finish(contenders[0], '最后生存者');
    } else if (contenders.length === 0) {
      this.finish(null, '所有玩家同时淘汰');
    }
  }

  protected onEnemyDeath(_enemy: Enemy): void {}

  protected onPlayerDeath(player: OnlineTank): void {
    player.lives = Math.max(0, player.lives - 1);
    const attacker = player.lastAttacker;
    if (attacker instanceof OnlineTank && attacker !== player) {
      attacker.kills += 1;
      attacker.score += 100;
      if (this.rng() < 0.35) this.spawnResourcePickup(player.center.x, player.center.y);
    }
  }

  protected canRespawn(player: OnlineTank): boolean {
    return player.lives > 0;
  }

  protected snapshotMeta(): SnapshotMeta {
    return {
      stage: 1,
      remainingMs: this.zoneTimerMs,
      killTarget: 0,
      teamLives: 0,
      baseHp: 0,
      baseMaxHp: 0,
      baseInvulnMs: 0,
      remainingEnemies: 0,
    };
  }

  protected override snapshotWeaponPickups(): OnlineWeaponPickupState[] {
    return this.weaponPickups.map((pickup) => ({ ...pickup }));
  }

  protected override snapshotZone(): OnlineZoneState {
    return {
      x: this.zoneX,
      y: this.zoneY,
      radius: this.zoneRadius,
      targetX: this.zoneTargetX,
      targetY: this.zoneTargetY,
      targetRadius: this.zoneTargetRadius,
      phase: this.zonePhase,
      shrinking: this.zoneShrinking,
      nextChangeMs: this.zoneTimerMs,
    };
  }

  protected override respawnCandidates(player: OnlineTank, preferredIndex: number) {
    const candidates: Array<{ x: number; y: number }> = [];
    const half = TANK_SIZE / 2;
    const usableRadius = Math.max(TILE, this.zoneRadius - TANK_SIZE);
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const radius = Math.sqrt(this.rng()) * usableRadius;
      const centerX = clamp(
        this.zoneX + Math.cos(angle) * radius,
        half,
        this.world.widthPx - half,
      );
      const centerY = clamp(
        this.zoneY + Math.sin(angle) * radius,
        half,
        this.world.heightPx - half,
      );
      candidates.push({ x: centerX - half, y: centerY - half });
    }
    return [...candidates, ...super.respawnCandidates(player, preferredIndex)];
  }

  private onTileDestroyed(col: number, row: number, kind: TileKind): void {
    if (kind !== 'brick' || this.rng() >= 0.08) return;
    this.spawnResourcePickup((col + 0.5) * TILE, (row + 0.5) * TILE);
  }

  private spawnResourcePickup(x: number, y: number): void {
    const kind: OnlinePickupKind = this.rng() < 0.04
      ? 'life'
      : rollPickupChoices(this.rng, 1)[0];
    if (!kind) return;
    this.weaponPickups.push({
      id: this.nextPickupId++,
      kind,
      x,
      y,
      size: TILE * 1.25,
      age: 0,
      lifeMs: 25000,
    });
  }

  private spawnRandomResource(): void {
    if (this.weaponPickups.length >= 24) return;
    const point = this.randomOpenPoint();
    if (point) this.spawnResourcePickup(point.x, point.y);
  }

  private randomOpenPoint(): { x: number; y: number } | null {
    const half = TILE * 0.7;
    const usableRadius = Math.max(0, this.zoneRadius - TILE * 2);
    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const radius = Math.sqrt(this.rng()) * usableRadius;
      const x = clamp(this.zoneX + Math.cos(angle) * radius, half, this.world.widthPx - half);
      const y = clamp(this.zoneY + Math.sin(angle) * radius, half, this.world.heightPx - half);
      const rect = { x: x - half, y: y - half, w: half * 2, h: half * 2 };
      if (!this.world.canTankFit(rect)) continue;
      if (this.allTanks().some((tank) => tank.alive && rectsOverlap(rect, tank.rect))) continue;
      return { x, y };
    }
    return null;
  }

  private updateWeaponPickups(dt: number): void {
    for (const pickup of this.weaponPickups) {
      pickup.age += dt;
      pickup.lifeMs -= dt * 1000;
      if (pickup.lifeMs <= 0) continue;
      const half = pickup.size / 2;
      const pickupRect = {
        x: pickup.x - half,
        y: pickup.y - half,
        w: pickup.size,
        h: pickup.size,
      };
      const collector = this.players.find(
        (player) => player.alive && rectsOverlap(player.rect, pickupRect),
      );
      if (!collector) continue;
      if (pickup.kind === 'life') collector.lives = Math.min(9, collector.lives + 1);
      else collector.grantWeapon(pickup.kind);
      pickup.lifeMs = 0;
    }
    this.weaponPickups = this.weaponPickups.filter((pickup) => pickup.lifeMs > 0);
  }

  private updateZone(dt: number): void {
    if (!this.zoneShrinking && this.zonePhase >= ZONE_FACTORS.length) {
      this.zoneTimerMs = 0;
      return;
    }
    this.zoneTimerMs = Math.max(0, this.zoneTimerMs - dt * 1000);
    if (this.zoneShrinking) {
      const progress = 1 - this.zoneTimerMs / BRAWL_ZONE_SHRINK_MS;
      this.zoneX = this.zoneStartX + (this.zoneTargetX - this.zoneStartX) * progress;
      this.zoneY = this.zoneStartY + (this.zoneTargetY - this.zoneStartY) * progress;
      this.zoneRadius = this.zoneStartRadius
        + (this.zoneTargetRadius - this.zoneStartRadius) * progress;
      if (this.zoneTimerMs <= 0) {
        this.zoneX = this.zoneTargetX;
        this.zoneY = this.zoneTargetY;
        this.zoneRadius = this.zoneTargetRadius;
        this.zoneShrinking = false;
        if (this.zonePhase < ZONE_FACTORS.length) {
          this.prepareNextZoneTarget();
          this.zoneTimerMs = BRAWL_ZONE_WAIT_MS;
        } else {
          this.zoneTimerMs = 0;
        }
      }
      return;
    }
    if (this.zoneTimerMs > 0) return;

    this.zoneStartX = this.zoneX;
    this.zoneStartY = this.zoneY;
    this.zoneStartRadius = this.zoneRadius;
    this.zonePhase += 1;
    this.zoneShrinking = true;
    this.zoneTimerMs = BRAWL_ZONE_SHRINK_MS;
  }

  private prepareNextZoneTarget(): void {
    this.zoneTargetRadius = (Math.hypot(this.world.widthPx, this.world.heightPx) / 2 + TILE)
      * ZONE_FACTORS[this.zonePhase];
    const allowance = Math.max(0, this.zoneRadius - this.zoneTargetRadius);
    const angle = this.rng() * Math.PI * 2;
    const offset = Math.sqrt(this.rng()) * allowance * 0.78;
    this.zoneTargetX = clamp(
      this.zoneX + Math.cos(angle) * offset,
      TILE * 2,
      this.world.widthPx - TILE * 2,
    );
    this.zoneTargetY = clamp(
      this.zoneY + Math.sin(angle) * offset,
      TILE * 2,
      this.world.heightPx - TILE * 2,
    );
  }

  private applyZoneDamage(dt: number): void {
    const damagePerSecond = 0.5 + this.zonePhase * 0.18;
    for (const player of this.players) {
      if (!player.alive || distance(player.center, { x: this.zoneX, y: this.zoneY }) <= this.zoneRadius) {
        continue;
      }
      player.takeZoneDamage(damagePerSecond * dt);
    }
  }
}
