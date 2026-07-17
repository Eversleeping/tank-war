// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { OnlineSnapshot } from '../src/multiplayer/protocol.ts';
import { OnlineHUD } from '../src/multiplayer/client/OnlineHUD.ts';

beforeEach(() => {
  document.body.innerHTML = '<div id="hud"></div>';
});

describe('OnlineHUD stability', () => {
  it('throttles network text and preserves unchanged DOM nodes', () => {
    const root = document.getElementById('hud') as HTMLDivElement;
    const hud = new OnlineHUD(root);
    const snapshot = makeSnapshot();

    hud.update(snapshot, 'p1', 'normal', network(9, 8), 1000);
    const topbar = root.querySelector('.online-topbar');
    const values = () => [...root.querySelectorAll('.online-network b')].map((el) => el.textContent);
    expect(values()).toEqual(['9', '8']);

    hud.update(snapshot, 'p1', 'normal', network(123, 45), 1100);
    expect(values()).toEqual(['9', '8']);
    expect(root.querySelector('.online-topbar')).toBe(topbar);

    hud.update(snapshot, 'p1', 'normal', network(123, 45), 1250);
    expect(values()).toEqual(['123', '45']);
  });
});

function network(rttMs: number, snapshotAgeMs: number) {
  return { rttMs, snapshotAgeMs, jitterMs: 0, droppedSnapshots: 0 };
}

function makeSnapshot(): OnlineSnapshot {
  return {
    mode: 'duo',
    stage: 1,
    elapsedMs: 0,
    remainingMs: 0,
    killTarget: 0,
    teamLives: 6,
    baseHp: 5,
    baseMaxHp: 5,
    baseInvulnMs: 0,
    remainingEnemies: 8,
    alivePlayers: 2,
    players: [{
      id: 'p1',
      name: 'P1',
      color: '#22c55e',
      x: 0,
      y: 0,
      w: 64,
      h: 64,
      dir: 'up',
      hp: 3,
      maxHp: 3,
      alive: true,
      invulnMs: 0,
      freezeMs: 0,
      burnMs: 0,
      energy: 100,
      weapon: 'normal',
      unlockedWeapons: ['normal'],
      bulletLevels: {},
      kills: 0,
      deaths: 0,
      score: 0,
      respawnMs: 0,
      lives: 3,
    }],
    enemies: [],
    bullets: [],
    effects: [],
    weaponPickups: [],
  };
}
