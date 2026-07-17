import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../server/multiplayer/FixedStepClock.ts';

describe('FixedStepClock', () => {
  it('accumulates partial time into deterministic simulation steps', () => {
    const clock = new FixedStepClock(60, 5, 1000);
    expect(clock.advance(1008)).toBe(0);
    expect(clock.advance(1017)).toBe(1);
    expect(clock.advance(1034)).toBe(1);
    expect(clock.stepSeconds).toBeCloseTo(1 / 60);
  });

  it('bounds catch-up work after an event-loop stall', () => {
    const clock = new FixedStepClock(60, 5, 0);
    expect(clock.advance(1000)).toBe(5);
    expect(clock.advance(1000)).toBe(0);
  });

  it('ignores a clock that moves backwards', () => {
    const clock = new FixedStepClock(60, 5, 100);
    expect(clock.advance(90)).toBe(0);
    expect(clock.advance(117)).toBe(1);
  });
});
