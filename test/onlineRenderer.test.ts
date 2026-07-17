import { describe, expect, it } from 'vitest';
import { requiresCameraReset } from '../src/multiplayer/client/OnlineRenderer.ts';

describe('online renderer world updates', () => {
  it('preserves the camera when only terrain revision changes', () => {
    expect(requiresCameraReset(
      { version: 1_000_004, cols: 64, rows: 48 },
      { version: 1_000_005, cols: 64, rows: 48 },
    )).toBe(false);
  });

  it('resets the camera for a new stage or map size', () => {
    expect(requiresCameraReset(
      { version: 1_000_005, cols: 33, rows: 25 },
      { version: 2_000_001, cols: 33, rows: 25 },
    )).toBe(true);
    expect(requiresCameraReset(
      { version: 1_000_005, cols: 33, rows: 25 },
      { version: 1_000_006, cols: 64, rows: 48 },
    )).toBe(true);
  });
});
