import { describe, expect, it } from 'vitest';
import { combatViewport } from '../src/game/viewport.ts';

describe('combat viewport layout', () => {
  it('reserves the same desktop sidebar for every combat mode', () => {
    expect(combatViewport(1600, 900, true)).toEqual({
      viewW: 1280,
      viewH: 900,
      offsetX: 10,
      offsetY: 0,
      sidebar: true,
    });
  });

  it('uses the full viewport when the sidebar is disabled or the screen is narrow', () => {
    expect(combatViewport(800, 600, true)).toMatchObject({ viewW: 800, viewH: 600, sidebar: false });
    expect(combatViewport(1600, 900, false)).toMatchObject({ viewW: 1600, viewH: 900, sidebar: false });
  });
});
