import { EnemyAI } from '../../game/EnemyAI.ts';
import { BASE_REPAIR_SHIELD_MS } from '../../game/baseRules.ts';
import {
  BOSS_TURRET_DIRS,
  bossBarrageInterval,
  bossDiagonalAngles,
  bossHp,
  isBossStage,
  remainingEnemyCount,
} from '../../game/boss.ts';
import {
  PLAYER_LIVES,
  stageBonus,
  TANK_SIZE,
  aiTier,
  enemyFireCd,
  enemyHp,
  enemyMaxOnScreen,
  enemyRank,
  enemySpawnInterval,
  enemySpeed,
  enemyTotal,
} from '../../game/constants.ts';
import { rollPickupChoices } from '../../game/BulletTypes.ts';
import type { BulletKind } from '../../game/BulletKind.ts';
import { DUO_PICKUP_TIMEOUT_MS, type OnlineSnapshot } from '../protocol.ts';
import { Bullet } from '../../game/entities/Bullet.ts';
import { Enemy, rollEnemyKind } from '../../game/entities/Enemy.ts';
import type { Vec2 } from '../../game/types.ts';
import { rectCenter } from '../../game/types.ts';
import { BaseSimulation, type SnapshotMeta } from './BaseSimulation.ts';
import { mulberry32, muzzleFor, shuffled } from './combat.ts';
import { createDuoWorld, duoSpawnPoints } from './maps.ts';
import { OnlineTank } from './OnlineTank.ts';
import type { OnlineParticipant } from './types.ts';

export class DuoSimulation extends BaseSimulation {
  private rng: () => number;
  private ai = new EnemyAI();
  private enemySpawnQueue = 0;
  private spawnTimerMs = 0;
  private bossSpawned = false;
  private teamLives: number;
  private stage = 1;
  private pickupChoices: BulletKind[] | null = null;
  private pickupRemainingMs = 0;

  constructor(participants: OnlineParticipant[], seed = Date.now()) {
    const rng = mulberry32(seed >>> 0);
    const world = createDuoWorld(1, rng);
    super('duo', participants, world, duoSpawnPoints(world));
    this.rng = rng;
    this.teamLives = PLAYER_LIVES * participants.length;
    this.beginStage(1, false);
  }

  override step(dt: number): void {
    if (this.pickupChoices) {
      const safeDt = Math.max(0, Math.min(0.05, dt));
      this.pickupRemainingMs = Math.max(0, this.pickupRemainingMs - safeDt * 1000);
      if (this.pickupRemainingMs === 0) {
        const index = Math.floor(this.rng() * this.pickupChoices.length);
        const weapon = this.pickupChoices[index] ?? this.pickupChoices[0];
        if (weapon) this.applyPickup(weapon);
      }
      return;
    }
    super.step(dt);
  }

  override snapshot(includeWorld = false): OnlineSnapshot {
    return {
      ...super.snapshot(includeWorld),
      pickupChoices: this.pickupChoices ? [...this.pickupChoices] : undefined,
      pickupSelectorId: this.pickupChoices ? this.players[0]?.playerId : undefined,
      pickupRemainingMs: this.pickupChoices ? this.pickupRemainingMs : undefined,
    };
  }

  choosePickup(playerId: string, weapon: BulletKind): boolean {
    if (!this.pickupChoices || this.players[0]?.playerId !== playerId) return false;
    if (!this.pickupChoices.includes(weapon)) return false;
    this.applyPickup(weapon);
    return true;
  }

  private applyPickup(weapon: BulletKind): void {
    const bonus = stageBonus(this.stage);
    for (const player of this.players) {
      player.grantWeapon(weapon);
      player.score += bonus;
      player.weaponEnergy = player.maxWeaponEnergy;
    }
    this.pickupChoices = null;
    this.pickupRemainingMs = 0;
    this.beginStage(this.stage + 1, true);
  }

  protected beforeBullets(dt: number): void {
    const livePlayers = this.players.filter((player) => player.alive);
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const target = nearestPlayer(enemy.center, livePlayers) ?? this.players[0];
      if (!target) continue;
      const shots = this.ai.update(dt, enemy, {
        tier: aiTier(this.stage),
        world: this.world,
        player: target,
        tanks: this.allTanks(),
        bullets: this.bullets,
        rng: this.rng,
        baseCenter: () => rectCenter(this.world.baseRect()),
      });
      this.bullets.push(...shots);
    }
    for (const enemy of this.enemies) enemy.update(dt);
    this.updateBossBarrage(dt);
  }

  protected afterStep(dt: number): void {
    if (!this.world.baseAlive) {
      if (this.teamLives > 0) {
        this.teamLives -= 1;
        this.world.repairBase(Math.ceil(this.world.baseMaxHp / 2), BASE_REPAIR_SHIELD_MS);
      } else {
        this.finish(null, '基地失守且装甲储备耗尽');
        return;
      }
    }
    if (this.teamLives <= 0 && this.players.every((player) => !player.alive)) {
      this.finish(null, '小队全灭');
      return;
    }

    this.spawnTimerMs -= dt * 1000;
    if (
      this.enemySpawnQueue > 0 &&
      this.spawnTimerMs <= 0 &&
      this.enemies.length < enemyMaxOnScreen(this.stage)
    ) {
      this.spawnEnemy();
      this.spawnTimerMs = enemySpawnInterval(this.stage);
    }

    if (
      isBossStage(this.stage) &&
      !this.bossSpawned &&
      this.enemySpawnQueue <= 0 &&
      this.enemies.length === 0
    ) {
      this.spawnBoss();
    }
    if (this.enemySpawnQueue <= 0 && this.enemies.length === 0) {
      if (!isBossStage(this.stage) || this.bossSpawned) {
        this.pickupChoices = rollPickupChoices(this.rng, 3, this.stage);
        this.pickupRemainingMs = DUO_PICKUP_TIMEOUT_MS;
      }
    }
  }

  protected onEnemyDeath(enemy: Enemy): void {
    const attacker = enemy.lastAttacker;
    if (attacker instanceof OnlineTank) {
      attacker.kills += 1;
      attacker.score += Math.round(100 * enemy.scoreMul);
    }
  }

  protected onPlayerDeath(_player: OnlineTank): void {
    this.teamLives = Math.max(0, this.teamLives - 1);
  }

  protected canRespawn(_player: OnlineTank): boolean {
    return this.teamLives > 0;
  }

  protected snapshotMeta(): SnapshotMeta {
    return {
      stage: this.stage,
      remainingMs: 0,
      killTarget: 0,
      teamLives: this.teamLives,
      baseHp: this.world.baseHp,
      baseMaxHp: this.world.baseMaxHp,
      baseInvulnMs: this.world.baseInvulnMs,
      remainingEnemies: remainingEnemyCount(
        this.stage,
        this.enemySpawnQueue,
        this.enemies.length,
        this.bossSpawned,
      ),
    };
  }

  private beginStage(stage: number, rebuildWorld: boolean): void {
    this.stage = stage;
    if (rebuildWorld) {
      this.rng = mulberry32((stage * 9301 + 49297) >>> 0);
      const world = createDuoWorld(stage, this.rng);
      this.replaceWorld(world, duoSpawnPoints(world));
    }
    this.enemies = [];
    this.bullets = [];
    this.enemySpawnQueue = enemyTotal(stage);
    this.spawnTimerMs = 350;
    this.bossSpawned = false;
    this.resetPlayers();
  }

  private spawnEnemy(): void {
    const tanks = this.allTanks();
    for (const spawn of shuffled(this.world.enemySpawns, this.rng)) {
      const rect = { x: spawn.x, y: spawn.y, w: TANK_SIZE, h: TANK_SIZE };
      const occupied = tanks.filter((tank) => tank.alive).map((tank) => tank.rect);
      if (!this.world.isRectFree(rect, occupied)) continue;
      const enemy = new Enemy(
        rollEnemyKind(aiTier(this.stage), this.rng),
        spawn.x,
        spawn.y,
        enemyHp(this.stage),
        enemySpeed(this.stage),
        enemyRank(this.stage),
      );
      enemy.aiFireCooldownMs = enemyFireCd(this.stage) * (0.5 + this.rng());
      enemy.invulnMs = 1000;
      this.enemies.push(enemy);
      this.enemySpawnQueue -= 1;
      return;
    }
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    const spawn = this.world.enemySpawns[1] ?? this.world.enemySpawns[0];
    const boss = new Enemy(
      'boss',
      spawn.x,
      spawn.y,
      bossHp(this.stage),
      enemySpeed(this.stage),
      enemyRank(this.stage),
    );
    boss.hp = bossHp(this.stage);
    boss.maxHp = boss.hp;
    boss.invulnMs = 800;
    boss.barrageCooldownMs = bossBarrageInterval(this.stage);
    this.enemies.push(boss);
  }

  private updateBossBarrage(dt: number): void {
    for (const boss of this.enemies) {
      if (!boss.alive || !boss.isBoss) continue;
      boss.barrageCooldownMs -= dt * 1000;
      if (boss.barrageCooldownMs > 0) continue;
      boss.barrageCooldownMs = bossBarrageInterval(this.stage);
      const spec = boss.spec();
      const center = boss.center;
      const offset = TANK_SIZE / 2 + 2;
      for (const dir of BOSS_TURRET_DIRS) {
        this.bullets.push(new Bullet(spec, boss, dir, muzzleFor(center, dir, offset)));
      }
      for (const angle of bossDiagonalAngles(this.stage)) {
        const bullet = new Bullet(spec, boss, 'up', center);
        bullet.vx = Math.cos(angle) * spec.speed;
        bullet.vy = Math.sin(angle) * spec.speed;
        this.bullets.push(bullet);
      }
    }
  }
}

function nearestPlayer(origin: Vec2, players: OnlineTank[]): OnlineTank | null {
  let best: OnlineTank | null = null;
  let bestDistance = Infinity;
  for (const player of players) {
    const distance = Math.hypot(player.center.x - origin.x, player.center.y - origin.y);
    if (distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  }
  return best;
}
