import { describe, expect, it } from 'vitest';
import { BULLET_SPECS } from '../src/game/BulletTypes.ts';
import { Bullet } from '../src/game/entities/Bullet.ts';
import { BrawlSimulation } from '../src/multiplayer/simulation/BrawlSimulation.ts';
import { DuoSimulation } from '../src/multiplayer/simulation/DuoSimulation.ts';
import { PLAYER_MAX_HP, PLAYER_SPEED } from '../src/game/constants.ts';
import { BRAWL_MAP_SIZE } from '../src/multiplayer/simulation/maps.ts';
import { rectsOverlap } from '../src/game/types.ts';
import { DUO_PICKUP_TIMEOUT_MS } from '../src/multiplayer/protocol.ts';

const participants = [
  { id: 'p1', name: '甲' },
  { id: 'p2', name: '乙' },
];

describe('online simulations', () => {
  it('creates a cooperative endless match with shared base state', () => {
    const simulation = new DuoSimulation(participants, 123);
    const snapshot = simulation.snapshot(true);

    expect(snapshot.mode).toBe('duo');
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players[0].team).toBeUndefined();
    expect(snapshot.baseHp).toBeGreaterThan(0);
    expect(snapshot.teamLives).toBe(6);
    expect(snapshot.world?.tiles.length).toBe(snapshot.world!.cols * snapshot.world!.rows);
    expect(snapshot.players[0].maxHp).toBe(PLAYER_MAX_HP);
    expect(simulation.players[0].speed).toBe(PLAYER_SPEED);
    expect(snapshot.players[0].unlockedWeapons).toEqual(['normal']);
  });

  it('generates a fresh deterministic brawl terrain for each seed', () => {
    const first = new BrawlSimulation(participants, 100).snapshot(true).world!;
    const repeated = new BrawlSimulation(participants, 100).snapshot(true).world!;
    const different = new BrawlSimulation(participants, 101).snapshot(true).world!;

    expect(first.tiles).toEqual(repeated.tiles);
    expect(first.tiles).not.toEqual(different.tiles);
  });

  it('rejects locked weapons and waits for the host to choose a shared reward', () => {
    const simulation = new DuoSimulation(participants, 123);
    simulation.players[0].speedMul = 1.36;
    simulation.players[0].cooldownMul = 0.7;
    simulation.players[1].speedMul = 1.18;
    simulation.players[1].cooldownMul = 0.85;
    simulation.setInput('p1', { dir: null, firing: false, weapon: 'railgun', seq: 1 });
    simulation.step(0);
    expect(simulation.snapshot().players[0].weapon).toBe('normal');

    const state = simulation as unknown as { enemySpawnQueue: number; enemies: unknown[] };
    state.enemySpawnQueue = 0;
    state.enemies = [];
    simulation.step(1 / 60);

    const pending = simulation.snapshot();
    expect(pending.stage).toBe(1);
    expect(pending.pickupChoices).toHaveLength(3);
    expect(pending.pickupSelectorId).toBe('p1');
    expect(pending.pickupRemainingMs).toBe(DUO_PICKUP_TIMEOUT_MS);
    expect(simulation.choosePickup('p2', pending.pickupChoices![0])).toBe(false);
    expect(simulation.choosePickup('p1', pending.pickupChoices![0])).toBe(true);

    const nextStage = simulation.snapshot();
    expect(nextStage.stage).toBe(2);
    expect(nextStage.pickupChoices).toBeUndefined();
    expect(nextStage.players[0].unlockedWeapons).toHaveLength(2);
    expect(nextStage.players[0].unlockedWeapons).toEqual(nextStage.players[1].unlockedWeapons);
    expect(simulation.players[0].speedMul).toBe(1.36);
    expect(simulation.players[0].cooldownMul).toBe(0.7);
    expect(simulation.players[1].speedMul).toBe(1.18);
    expect(simulation.players[1].cooldownMul).toBe(0.85);
  });

  it('randomly applies a shared reward when the host does not choose within 30 seconds', () => {
    const simulation = new DuoSimulation(participants, 123);
    const state = simulation as unknown as { enemySpawnQueue: number; enemies: unknown[] };
    state.enemySpawnQueue = 0;
    state.enemies = [];
    simulation.step(1 / 60);

    const pending = simulation.snapshot();
    const choices = pending.pickupChoices!;
    expect(pending.pickupRemainingMs).toBe(DUO_PICKUP_TIMEOUT_MS);

    for (let elapsed = 0; elapsed < DUO_PICKUP_TIMEOUT_MS; elapsed += 50) {
      simulation.step(0.05);
    }

    const nextStage = simulation.snapshot();
    expect(nextStage.stage).toBe(2);
    expect(nextStage.pickupChoices).toBeUndefined();
    expect(nextStage.pickupRemainingMs).toBeUndefined();
    expect(nextStage.players[0].unlockedWeapons.some((weapon) => choices.includes(weapon))).toBe(true);
    expect(nextStage.players[0].unlockedWeapons).toEqual(nextStage.players[1].unlockedWeapons);
  });

  it('increments the network world version when a brick is destroyed', () => {
    const simulation = new DuoSimulation(participants, 321);
    const before = simulation.worldVersion;
    const index = simulation.world.tiles.findIndex((tile) => tile === 'brick');
    expect(index).toBeGreaterThanOrEqual(0);
    const col = index % simulation.world.cols;
    const row = Math.floor(index / simulation.world.cols);

    simulation.world.hitTile(col, row, 1, false);

    expect(simulation.world.get(col, row)).toBe('empty');
    expect(simulation.worldVersion).toBeGreaterThan(before);
  });

  it('uses separate teams and attributes kills in brawl mode', () => {
    const simulation = new BrawlSimulation(participants, 456);
    const [attacker, victim] = simulation.players;
    expect(attacker.team).not.toBe(victim.team);

    victim.takeHit(attacker, victim.hp, BULLET_SPECS.railgun);
    simulation.step(0);

    expect(attacker.kills).toBe(1);
    expect(victim.deaths).toBe(1);
    expect(victim.lives).toBe(4);
    expect(victim.respawnMs).toBeGreaterThan(0);
  });

  it('starts brawl with only the normal shell unlocked', () => {
    const simulation = new BrawlSimulation(participants, 456);
    expect(simulation.snapshot().players.map((player) => player.unlockedWeapons))
      .toEqual([['normal'], ['normal']]);
    expect(simulation.snapshot().players.map((player) => player.lives)).toEqual([5, 5]);
    expect(simulation.snapshot().weaponPickups.length).toBeGreaterThan(0);
  });

  it('eliminates players with no lives and awards the last survivor', () => {
    const simulation = new BrawlSimulation(participants, 456);
    const [winner, victim] = simulation.players;
    victim.lives = 1;

    victim.takeHit(winner, victim.hp, BULLET_SPECS.normal);
    simulation.step(0);

    expect(victim.lives).toBe(0);
    expect(simulation.result?.winnerId).toBe(winner.playerId);
  });

  it('respawns at a different safe point when the preferred spawn is occupied', () => {
    const simulation = new BrawlSimulation(participants, 456);
    const [blocker, victim] = simulation.players;
    const occupiedSpawn = { x: victim.rect.x, y: victim.rect.y };

    victim.takeHit(blocker, victim.hp, BULLET_SPECS.normal);
    simulation.step(0);
    blocker.rect.x = occupiedSpawn.x;
    blocker.rect.y = occupiedSpawn.y;
    victim.respawnMs = 0;
    simulation.step(0);

    expect(victim.alive).toBe(true);
    expect(rectsOverlap(victim.rect, blocker.rect)).toBe(false);
    expect({ x: victim.rect.x, y: victim.rect.y }).not.toEqual(occupiedSpawn);
  });

  it('collects dropped shells and upgrades duplicate pickups', () => {
    const simulation = new BrawlSimulation(participants, 456);
    const player = simulation.players[0];
    const state = simulation as unknown as {
      weaponPickups: Array<{
        id: number; kind: 'rapid'; x: number; y: number; size: number; age: number; lifeMs: number;
      }>;
    };
    const drop = () => ({
      id: 1,
      kind: 'rapid' as const,
      x: player.center.x,
      y: player.center.y,
      size: 40,
      age: 0,
      lifeMs: 12000,
    });

    state.weaponPickups = [drop()];
    simulation.step(1 / 60);
    expect(simulation.snapshot().players[0].unlockedWeapons).toContain('rapid');

    state.weaponPickups = [drop()];
    simulation.step(1 / 60);
    expect(simulation.snapshot().players[0].bulletLevels.rapid).toBe(2);
    expect(simulation.snapshot().weaponPickups).toEqual([]);
  });

  it('grants a low-probability extra-life resource', () => {
    const simulation = new BrawlSimulation(participants, 456);
    const player = simulation.players[0];
    const state = simulation as unknown as {
      weaponPickups: Array<{
        id: number; kind: 'life'; x: number; y: number; size: number; age: number; lifeMs: number;
      }>;
    };
    state.weaponPickups = [{
      id: 99,
      kind: 'life',
      x: player.center.x,
      y: player.center.y,
      size: 40,
      age: 0,
      lifeMs: 25000,
    }];

    simulation.step(1 / 60);
    expect(player.lives).toBe(6);
  });

  it('starts shrinking the safe zone after the wait phase', () => {
    const simulation = new BrawlSimulation(participants, 456);
    const initial = simulation.snapshot().zone!;
    expect(initial.shrinking).toBe(false);
    expect(initial.targetRadius).toBeLessThan(initial.radius);

    for (let i = 0; i < 601; i++) simulation.step(0.05);
    const shrinking = simulation.snapshot().zone!;
    expect(shrinking.shrinking).toBe(true);
    expect(shrinking.phase).toBe(1);
    expect(shrinking.radius).toBeLessThan(initial.radius);
  });

  it('applies zone damage and eliminates players who run out of lives', () => {
    const simulation = new BrawlSimulation(participants, 456);
    const [safePlayer, exposedPlayer] = simulation.players;
    const state = simulation as unknown as { zoneX: number; zoneY: number; zoneRadius: number };
    state.zoneX = safePlayer.center.x;
    state.zoneY = safePlayer.center.y;
    state.zoneRadius = 80;
    exposedPlayer.lives = 1;
    exposedPlayer.hp = 0.01;

    simulation.step(0.05);

    expect(exposedPlayer.lives).toBe(0);
    expect(simulation.result?.winnerId).toBe(safePlayer.playerId);
  });

  it('can spawn a weapon pickup when a brick is destroyed', () => {
    const simulation = new BrawlSimulation(participants, 456);
    const state = simulation as unknown as {
      rng: () => number;
      weaponPickups: unknown[];
      onTileDestroyed: (col: number, row: number, kind: 'brick') => void;
    };
    state.weaponPickups = [];
    state.rng = () => 0;
    state.onTileDestroyed(4, 5, 'brick');

    const [pickup] = simulation.snapshot().weaponPickups;
    expect(pickup).toMatchObject({ x: 4.5 * 32, y: 5.5 * 32 });
  });

  it('accepts sequenced input and exposes all network state in snapshots', () => {
    const simulation = new BrawlSimulation(participants, 789);
    simulation.setInput('p1', { dir: 'right', firing: true, weapon: 'rapid', seq: 1 });
    simulation.step(0.1);
    const snapshot = simulation.snapshot(true);

    expect(snapshot.players.find((player) => player.id === 'p1')?.weapon).toBe('normal');
    expect(snapshot.world).toBeDefined();
    expect(snapshot.killTarget).toBe(0);
    expect(snapshot.remainingMs).toBeGreaterThan(0);
    expect(snapshot.players[0].unlockedWeapons).toEqual(['normal']);
    expect(snapshot.players[0].ackSeq).toBe(1);
    expect(snapshot.weaponPickups.length).toBeGreaterThan(0);
    expect(snapshot.zone).toBeDefined();
    expect(snapshot.alivePlayers).toBe(2);
    expect(snapshot.world?.cols).toBe(BRAWL_MAP_SIZE.cols);
    expect(snapshot.world?.rows).toBe(BRAWL_MAP_SIZE.rows);
    expect(snapshot.effects).toContainEqual(expect.objectContaining({
      type: 'muzzle',
      bullet: 'normal',
      ownerId: 'p1',
    }));
  });

  it('publishes impact and player destruction effects for brawl clients', () => {
    const simulation = new BrawlSimulation(participants, 790);
    const [shooter, victim] = simulation.players;
    victim.invulnMs = 0;
    victim.hp = 1;
    const state = simulation as unknown as { bullets: Bullet[] };
    state.bullets = [new Bullet(BULLET_SPECS.normal, shooter, 'right', victim.center)];

    simulation.step(0);

    const effects = simulation.snapshot().effects;
    expect(effects).toContainEqual(expect.objectContaining({
      type: 'impact',
      bullet: 'normal',
    }));
    expect(effects).toContainEqual(expect.objectContaining({
      type: 'destroyed',
      target: 'player',
      color: victim.color,
    }));
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(effects.length);
  });
});
