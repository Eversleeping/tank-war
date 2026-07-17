import type { Enemy } from '../../game/entities/Enemy.ts';
import { Bullet } from '../../game/entities/Bullet.ts';
import { TANK_SIZE, TILE } from '../../game/constants.ts';
import { rectsOverlap, type Rect, type Vec2 } from '../../game/types.ts';
import type { World } from '../../game/World.ts';
import type {
  OnlineCombatEffect,
  OnlineInputState,
  OnlineMode,
  OnlineSnapshot,
  OnlineWeaponPickupState,
  OnlineWorldState,
  OnlineZoneState,
} from '../protocol.ts';
import { makeOnlineBullets } from './combat.ts';
import { ONLINE_PLAYER_COLORS, OnlineTank } from './OnlineTank.ts';
import type { MatchSimulation, OnlineParticipant, SimulationResult } from './types.ts';

export interface SnapshotMeta {
  stage: number;
  remainingMs: number;
  killTarget: number;
  teamLives: number;
  baseHp: number;
  baseMaxHp: number;
  baseInvulnMs: number;
  remainingEnemies: number;
}

type TimedCombatEffect = OnlineCombatEffect & { expiresAtMs: number };

const COMBAT_EFFECT_TTL_MS = 250;

export abstract class BaseSimulation implements MatchSimulation {
  readonly mode: OnlineMode;
  readonly players: OnlineTank[];
  world: World;
  private worldEpoch = 1;
  elapsedMs = 0;
  result: SimulationResult | null = null;

  protected inputs = new Map<string, OnlineInputState>();
  protected bullets: Bullet[] = [];
  protected enemies: Enemy[] = [];
  protected spawnPoints: Vec2[];
  private combatEffects: TimedCombatEffect[] = [];
  private nextCombatEffectId = 1;

  constructor(mode: OnlineMode, participants: OnlineParticipant[], world: World, spawns: Vec2[]) {
    this.mode = mode;
    this.world = world;
    this.spawnPoints = spawns;
    this.players = participants.map((participant, index) => {
      const spawn = spawns[index % spawns.length];
      const team = mode === 'duo' ? 'player' as const : `online:${participant.id}` as const;
      return new OnlineTank(
        participant,
        ONLINE_PLAYER_COLORS[index % ONLINE_PLAYER_COLORS.length],
        team,
        spawn.x,
        spawn.y,
      );
    });
  }

  setInput(playerId: string, input: OnlineInputState): void {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (!player) return;
    const previous = this.inputs.get(playerId);
    if (previous && input.seq <= previous.seq) return;
    const weapon = player.hasWeapon(input.weapon) ? input.weapon : 'normal';
    this.inputs.set(playerId, { ...input, weapon });
  }

  get worldVersion(): number {
    return this.worldEpoch * 1_000_000 + this.world.revision;
  }

  step(dt: number): void {
    if (this.result) return;
    const safeDt = Math.max(0, Math.min(0.05, dt));
    this.elapsedMs += safeDt * 1000;
    this.combatEffects = this.combatEffects.filter(
      (effect) => effect.expiresAtMs > this.elapsedMs,
    );
    const existingBulletIds = new Set(this.bullets.map((bullet) => bullet.id));
    this.world.update(safeDt);
    for (const player of this.players) this.updatePlayer(player, safeDt);
    this.beforeBullets(safeDt);
    this.emitMuzzlesForNewBullets(existingBulletIds);
    this.updateBullets(safeDt);
    this.reapDeaths();
    this.bullets = this.bullets.filter((bullet) => bullet.alive);
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
    this.afterStep(safeDt);
  }

  snapshot(includeWorld = false): OnlineSnapshot {
    const meta = this.snapshotMeta();
    return {
      mode: this.mode,
      stage: meta.stage,
      elapsedMs: Math.floor(this.elapsedMs),
      remainingMs: Math.floor(meta.remainingMs),
      killTarget: meta.killTarget,
      teamLives: meta.teamLives,
      baseHp: meta.baseHp,
      baseMaxHp: meta.baseMaxHp,
      baseInvulnMs: meta.baseInvulnMs,
      remainingEnemies: meta.remainingEnemies,
      alivePlayers: this.players.filter((player) => player.alive || player.lives > 0).length,
      players: this.players.map((player) => ({
        id: player.playerId,
        name: player.playerName,
        color: player.color,
        x: player.rect.x,
        y: player.rect.y,
        w: player.rect.w,
        h: player.rect.h,
        dir: player.dir,
        hp: player.hp,
        maxHp: player.maxHp,
        alive: player.alive,
        invulnMs: player.invulnMs,
        freezeMs: player.freezeMs,
        burnMs: player.burnMs,
        energy: player.weaponEnergy,
        weapon: player.currentBullet,
        unlockedWeapons: player.unlockedWeapons(),
        bulletLevels: { ...player.bulletLevels },
        kills: player.kills,
        deaths: player.deaths,
        score: player.score,
        respawnMs: player.respawnMs,
        lives: player.lives,
        ackSeq: this.inputs.get(player.playerId)?.seq ?? 0,
      })),
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        kind: enemy.profile.kind,
        rank: enemy.visualTier,
        x: enemy.rect.x,
        y: enemy.rect.y,
        w: enemy.rect.w,
        h: enemy.rect.h,
        dir: enemy.dir,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        alive: enemy.alive,
        invulnMs: enemy.invulnMs,
        freezeMs: enemy.freezeMs,
        burnMs: enemy.burnMs,
      })),
      bullets: this.bullets.map((bullet) => ({
        id: bullet.id,
        x: bullet.center.x,
        y: bullet.center.y,
        vx: bullet.vx,
        vy: bullet.vy,
        kind: bullet.spec.id,
        team: bullet.owner.team,
        ownerId: bullet.owner instanceof OnlineTank ? bullet.owner.playerId : null,
        age: bullet.age,
      })),
      effects: this.combatEffects.map(({ expiresAtMs: _expiresAtMs, ...effect }) => effect),
      weaponPickups: this.snapshotWeaponPickups(),
      zone: this.snapshotZone(),
      world: includeWorld ? this.worldState() : undefined,
    };
  }

  protected abstract beforeBullets(dt: number): void;
  protected abstract afterStep(dt: number): void;
  protected abstract onEnemyDeath(enemy: Enemy): void;
  protected abstract onPlayerDeath(player: OnlineTank): void;
  protected abstract canRespawn(player: OnlineTank): boolean;
  protected abstract snapshotMeta(): SnapshotMeta;

  protected snapshotWeaponPickups(): OnlineWeaponPickupState[] {
    return [];
  }

  protected snapshotZone(): OnlineZoneState | undefined {
    return undefined;
  }

  protected respawnCandidates(_player: OnlineTank, preferredIndex: number): Vec2[] {
    return this.spawnPoints.map(
      (_point, offset) => this.spawnPoints[(preferredIndex + offset) % this.spawnPoints.length],
    );
  }

  protected replaceWorld(world: World, spawns: Vec2[]): void {
    this.world = world;
    this.spawnPoints = spawns;
    this.worldEpoch += 1;
  }

  protected resetPlayers(): void {
    for (let index = 0; index < this.players.length; index++) {
      this.players[index].respawnAt(this.spawnPoints[index % this.spawnPoints.length]);
    }
  }

  protected allTanks(): Array<OnlineTank | Enemy> {
    return [...this.players, ...this.enemies];
  }

  protected finish(winner: OnlineTank | null, reason: string): void {
    this.result = {
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.playerName ?? '',
      reason,
    };
  }

  private updatePlayer(player: OnlineTank, dt: number): void {
    if (!player.alive) {
      if (!player.deathHandled) return;
      player.respawnMs = Math.max(0, player.respawnMs - dt * 1000);
      if (this.canRespawn(player) && player.respawnMs <= 0) {
        const index = this.players.indexOf(player);
        const spawn = this.findSafeRespawn(player, Math.max(0, index));
        if (spawn) player.respawnAt(spawn);
        else player.respawnMs = 250;
      }
      return;
    }
    player.update(dt);
    const input = this.inputs.get(player.playerId);
    if (!input) return;
    player.currentBullet = input.weapon;
    if (input.dir) player.tryMove(dt, input.dir, this.world, this.allTanks());
    if (!input.firing) return;
    const spec = player.spec();
    if (!player.canSpendEnergy(spec.energyCost)) return;
    const shots = player.fire((shotSpec, dir, muzzle) =>
      makeOnlineBullets(shotSpec, player, dir, muzzle));
    if (!shots) return;
    player.spendEnergy(spec.energyCost);
    this.bullets.push(...shots);
  }

  private updateBullets(dt: number): void {
    const context = {
      world: this.world,
      tanks: () => this.allTanks(),
      bullets: () => this.bullets,
      playExplosion: (
        pos: Vec2,
        radius: number,
        _color: string,
        bullet: import('../../game/BulletKind.ts').BulletKind = 'normal',
      ) => {
        this.combatEffects.push({
          id: this.nextCombatEffectId++,
          type: 'impact',
          x: pos.x,
          y: pos.y,
          radius,
          bullet,
          expiresAtMs: this.elapsedMs + COMBAT_EFFECT_TTL_MS,
        });
      },
      playBeam: (from: Vec2, to: Vec2, _color: string, width: number) => {
        this.combatEffects.push({
          id: this.nextCombatEffectId++,
          type: 'beam',
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
          width,
          bullet: 'chain',
          expiresAtMs: this.elapsedMs + COMBAT_EFFECT_TTL_MS,
        });
      },
    };
    for (const bullet of this.bullets) bullet.update(dt, context);
  }

  private reapDeaths(): void {
    for (const enemy of this.enemies) {
      const marked = enemy as Enemy & { onlineReaped?: boolean };
      if (enemy.alive || marked.onlineReaped) continue;
      marked.onlineReaped = true;
      this.combatEffects.push({
        id: this.nextCombatEffectId++,
        type: 'destroyed',
        x: enemy.center.x,
        y: enemy.center.y,
        radius: enemy.rect.w * 0.55,
        color: '#fb923c',
        target: 'enemy',
        expiresAtMs: this.elapsedMs + COMBAT_EFFECT_TTL_MS,
      });
      this.onEnemyDeath(enemy);
    }
    for (const player of this.players) {
      if (player.alive || player.deathHandled) continue;
      player.deathHandled = true;
      player.deaths += 1;
      player.respawnMs = 1800;
      this.combatEffects.push({
        id: this.nextCombatEffectId++,
        type: 'destroyed',
        x: player.center.x,
        y: player.center.y,
        radius: player.rect.w * 0.65,
        color: player.color,
        target: 'player',
        expiresAtMs: this.elapsedMs + COMBAT_EFFECT_TTL_MS,
      });
      this.onPlayerDeath(player);
    }
  }

  private emitMuzzlesForNewBullets(existingBulletIds: Set<number>): void {
    const emitted = new Set<string>();
    for (const bullet of this.bullets) {
      if (existingBulletIds.has(bullet.id)) continue;
      const center = bullet.center;
      const key = [
        bullet.owner.id,
        bullet.spec.id,
        Math.round(center.x * 2),
        Math.round(center.y * 2),
      ].join(':');
      if (emitted.has(key)) continue;
      emitted.add(key);
      this.combatEffects.push({
        id: this.nextCombatEffectId++,
        type: 'muzzle',
        x: center.x,
        y: center.y,
        angle: Math.atan2(bullet.vy, bullet.vx),
        bullet: bullet.spec.id,
        ownerId: bullet.owner instanceof OnlineTank ? bullet.owner.playerId : null,
        expiresAtMs: this.elapsedMs + COMBAT_EFFECT_TTL_MS,
      });
    }
  }

  private findSafeRespawn(player: OnlineTank, preferredIndex: number): Vec2 | null {
    const occupied = this.allTanks()
      .filter((tank) => tank !== player && tank.alive)
      .map((tank) => tank.rect);
    const isSafe = (point: Vec2): boolean => {
      const rect: Rect = { x: point.x, y: point.y, w: TANK_SIZE, h: TANK_SIZE };
      return this.world.canTankFit(rect)
        && occupied.every((blocker) => !rectsOverlap(rect, blocker));
    };

    for (const point of this.respawnCandidates(player, preferredIndex)) {
      if (isSafe(point)) return point;
    }

    const step = TILE * 2;
    for (let radius = 1; radius <= 4; radius++) {
      for (const origin of this.spawnPoints) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const point = { x: origin.x + dx * step, y: origin.y + dy * step };
            if (isSafe(point)) return point;
          }
        }
      }
    }
    return null;
  }

  private worldState(): OnlineWorldState {
    return {
      version: this.worldVersion,
      cols: this.world.cols,
      rows: this.world.rows,
      tiles: [...this.world.tiles],
      baseX: this.world.base.x,
      baseY: this.world.base.y,
    };
  }
}
