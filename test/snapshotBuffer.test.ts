import { describe, expect, it } from 'vitest';
import type { OnlineSnapshot } from '../src/multiplayer/protocol.ts';
import { SnapshotBuffer } from '../src/multiplayer/client/SnapshotBuffer.ts';

describe('SnapshotBuffer', () => {
  it('interpolates entity positions between server snapshots', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshotAt(0, 0), 1000);
    buffer.push(snapshotAt(100, 100), 1100);

    const halfway = buffer.sample(1150)!;
    expect(halfway.players[0].x).toBe(50);
    expect(halfway.enemies[0].x).toBe(60);
    expect(halfway.bullets[0].x).toBe(70);

    const settled = buffer.sample(1250)!;
    expect(settled.players[0].x).toBe(100);
  });

  it('uses the newest authoritative state for the local player', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snapshotAt(0, 0), 1000);
    buffer.push(snapshotAt(100, 100), 1100);

    const halfway = buffer.sample(1150, 'p1')!;
    expect(halfway.players[0].x).toBe(100);
    expect(halfway.enemies[0].x).toBe(60);
  });
});

function snapshotAt(x: number, elapsedMs: number): OnlineSnapshot {
  return {
    mode: 'duo',
    stage: 1,
    elapsedMs,
    remainingMs: 0,
    killTarget: 0,
    teamLives: 6,
    baseHp: 3,
    baseMaxHp: 3,
    baseInvulnMs: 0,
    remainingEnemies: 1,
    players: [{
      id: 'p1', name: 'P1', color: '#22c55e', x, y: 0, w: 64, h: 64,
      dir: 'right', hp: 3, maxHp: 3, alive: true, invulnMs: 0, freezeMs: 0,
      burnMs: 0, energy: 100, weapon: 'normal', unlockedWeapons: ['normal'],
      bulletLevels: {}, kills: 0, deaths: 0, score: 0, respawnMs: 0,
      lives: 3,
    }],
    enemies: [{
      id: 1, kind: 'scout', rank: 1, x: x + 10, y: 0, w: 64, h: 64,
      dir: 'left', hp: 1, maxHp: 1, alive: true, invulnMs: 0, freezeMs: 0, burnMs: 0,
    }],
    bullets: [{
      id: 2, x: x + 20, y: 0, vx: 100, vy: 0, kind: 'normal', team: 'player',
      ownerId: 'p1', age: 0,
    }],
    effects: [],
    weaponPickups: [],
    alivePlayers: 1,
  };
}
