import { describe, expect, it } from 'vitest';
import type { OnlineCombatEffect } from '../src/multiplayer/protocol.ts';
import {
  hasNearbyDestruction,
  unseenCombatEffects,
} from '../src/multiplayer/client/OnlineEffects.ts';

describe('online combat effect deduplication', () => {
  it('returns unseen effects in sequence order and advances the cursor', () => {
    const effects: OnlineCombatEffect[] = [
      { id: 4, type: 'impact', x: 1, y: 2, radius: 20, bullet: 'heavy' },
      { id: 2, type: 'muzzle', x: 0, y: 0, angle: 0, bullet: 'normal', ownerId: 'p1' },
      { id: 3, type: 'beam', fromX: 0, fromY: 0, toX: 10, toY: 10, width: 3, bullet: 'chain' },
    ];

    const batch = unseenCombatEffects(effects, 2);

    expect(batch.effects.map((effect) => effect.id)).toEqual([3, 4]);
    expect(batch.lastSeenId).toBe(4);
  });

  it('does not replay retained events from later snapshots', () => {
    const effects: OnlineCombatEffect[] = [
      { id: 8, type: 'destroyed', x: 4, y: 5, radius: 30, color: '#fff', target: 'player' },
    ];

    expect(unseenCombatEffects(effects, 8)).toEqual({ effects: [], lastSeenId: 8 });
  });

  it('suppresses a hit layer when the same event batch destroys the target', () => {
    const effects: OnlineCombatEffect[] = [
      { id: 9, type: 'impact', x: 100, y: 100, radius: 12, bullet: 'normal' },
      { id: 10, type: 'destroyed', x: 112, y: 106, radius: 30, color: '#fff', target: 'enemy' },
    ];

    expect(hasNearbyDestruction(effects, 100, 100)).toBe(true);
    expect(hasNearbyDestruction(effects, 300, 300)).toBe(false);
  });
});
