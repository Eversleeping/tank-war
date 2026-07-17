import { describe, it, expect } from 'vitest';
import {
  dirToVec,
  dirAngle,
  rectsOverlap,
  pointInRect,
  rectCenter,
  distance,
  clamp,
} from '../src/game/types.ts';

describe('dirToVec', () => {
  it('maps each direction to a unit vector', () => {
    expect(dirToVec('up')).toEqual({ x: 0, y: -1 });
    expect(dirToVec('down')).toEqual({ x: 0, y: 1 });
    expect(dirToVec('left')).toEqual({ x: -1, y: 0 });
    expect(dirToVec('right')).toEqual({ x: 1, y: 0 });
  });
});

describe('dirAngle', () => {
  it('returns radians consistent with dirToVec', () => {
    // cos/sin of the angle should match the unit vector
    for (const d of ['up', 'down', 'left', 'right'] as const) {
      const a = dirAngle(d);
      const v = dirToVec(d);
      expect(Math.cos(a)).toBeCloseTo(v.x, 6);
      expect(Math.sin(a)).toBeCloseTo(v.y, 6);
    }
  });
});

describe('rectsOverlap', () => {
  const base = { x: 0, y: 0, w: 10, h: 10 };
  it('detects overlapping rects', () => {
    expect(rectsOverlap(base, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });
  it('treats edge-touching as non-overlap', () => {
    expect(rectsOverlap(base, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });
  it('detects fully separate rects', () => {
    expect(rectsOverlap(base, { x: 100, y: 100, w: 5, h: 5 })).toBe(false);
  });
});

describe('pointInRect', () => {
  const r = { x: 0, y: 0, w: 10, h: 10 };
  it('includes interior and boundary points', () => {
    expect(pointInRect({ x: 5, y: 5 }, r)).toBe(true);
    expect(pointInRect({ x: 0, y: 0 }, r)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, r)).toBe(true);
  });
  it('excludes outside points', () => {
    expect(pointInRect({ x: -1, y: 5 }, r)).toBe(false);
    expect(pointInRect({ x: 5, y: 11 }, r)).toBe(false);
  });
});

describe('rectCenter', () => {
  it('returns the geometric center', () => {
    expect(rectCenter({ x: 0, y: 0, w: 10, h: 20 })).toEqual({ x: 5, y: 10 });
  });
});

describe('distance', () => {
  it('computes euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });
});

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
