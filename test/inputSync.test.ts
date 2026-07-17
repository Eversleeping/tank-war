import { describe, expect, it } from 'vitest';
import { InputSyncPolicy } from '../src/multiplayer/client/InputSync.ts';

const moving = { dir: 'right' as const, firing: false, weapon: 'normal' as const };

describe('InputSyncPolicy', () => {
  it('sends state changes immediately and identical states on heartbeat only', () => {
    const sync = new InputSyncPolicy();
    expect(sync.shouldSend(moving, 0, true)).toBe(true);
    expect(sync.shouldSend(moving, 0.01, true)).toBe(false);
    expect(sync.shouldSend({ ...moving, dir: null }, 0, true)).toBe(true);
    expect(sync.shouldSend({ ...moving, dir: null }, 0.05, true)).toBe(true);
  });

  it('suppresses heartbeats while an overlay owns input', () => {
    const sync = new InputSyncPolicy();
    expect(sync.shouldSend(moving, 0, false)).toBe(true);
    expect(sync.shouldSend(moving, 1, false)).toBe(false);
    expect(sync.shouldSend({ ...moving, firing: true }, 0, false)).toBe(true);
  });
});
