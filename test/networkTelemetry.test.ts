import { describe, expect, it } from 'vitest';
import { NetworkTelemetry } from '../src/multiplayer/client/NetworkTelemetry.ts';

describe('NetworkTelemetry', () => {
  it('smooths RTT, tracks jitter, and ignores unknown pongs', () => {
    const telemetry = new NetworkTelemetry();
    const first = telemetry.createPing(100);
    telemetry.recordPong(first, 150);
    telemetry.recordPong(999, 900);
    const second = telemetry.createPing(200);
    telemetry.recordPong(second, 270);

    const stats = telemetry.stats(300);
    expect(stats.rttMs).toBeCloseTo(52.5);
    expect(stats.jitterMs).toBeCloseTo(5);
  });

  it('reports snapshot age and client-side coalescing', () => {
    const telemetry = new NetworkTelemetry();
    telemetry.recordSnapshot(1000);
    telemetry.recordDroppedSnapshot();
    telemetry.recordDroppedSnapshot();

    expect(telemetry.stats(1042)).toMatchObject({
      snapshotAgeMs: 42,
      droppedSnapshots: 2,
    });
  });
});
