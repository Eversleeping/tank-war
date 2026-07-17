import { describe, expect, it } from 'vitest';
import {
  BRAWL_SNAPSHOT_HZ,
  DUO_PICKUP_TIMEOUT_MS,
  ONLINE_CAPACITY,
  ONLINE_INPUT_HEARTBEAT_HZ,
  ONLINE_MIN_PLAYERS,
  ONLINE_SIMULATION_HZ,
  ONLINE_SNAPSHOT_HZ,
  isOnlineMode,
  sanitizeOnlineName,
  sanitizeRoomCode,
} from '../src/multiplayer/protocol.ts';

describe('multiplayer protocol', () => {
  it('defines capacities and minimum players for both modes', () => {
    expect(ONLINE_CAPACITY).toEqual({ duo: 2, brawl: 10 });
    expect(ONLINE_MIN_PLAYERS).toEqual({ duo: 2, brawl: 2 });
  });

  it('keeps simulation at 60 Hz with a lower input heartbeat rate', () => {
    expect(ONLINE_SIMULATION_HZ).toBe(60);
    expect(ONLINE_INPUT_HEARTBEAT_HZ).toBe(20);
    expect(ONLINE_SNAPSHOT_HZ).toBe(60);
    expect(BRAWL_SNAPSHOT_HZ).toBe(60);
    expect(DUO_PICKUP_TIMEOUT_MS).toBe(30_000);
  });

  it('sanitizes room codes and player names', () => {
    expect(sanitizeRoomCode(' ab-12_cd ')).toBe('AB12CD');
    expect(sanitizeOnlineName('  指挥官甲  ')).toBe('指挥官甲');
    expect(sanitizeOnlineName('')).toBe('无名指挥官');
  });

  it('recognizes online modes only', () => {
    expect(isOnlineMode('duo')).toBe(true);
    expect(isOnlineMode('brawl')).toBe(true);
    expect(isOnlineMode('single')).toBe(false);
  });
});
