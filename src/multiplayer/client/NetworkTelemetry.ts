export interface OnlineNetworkStats {
  rttMs: number | null;
  jitterMs: number;
  snapshotAgeMs: number | null;
  droppedSnapshots: number;
}

const PING_EXPIRY_MS = 10_000;

export class NetworkTelemetry {
  private nextPingId = 1;
  private pendingPings = new Map<number, number>();
  private smoothedRttMs: number | null = null;
  private jitterMs = 0;
  private lastRttMs: number | null = null;
  private lastSnapshotAtMs: number | null = null;
  private droppedSnapshots = 0;

  createPing(nowMs: number): number {
    for (const [id, sentAtMs] of this.pendingPings) {
      if (nowMs - sentAtMs > PING_EXPIRY_MS) this.pendingPings.delete(id);
    }
    const id = this.nextPingId++;
    this.pendingPings.set(id, nowMs);
    return id;
  }

  recordPong(id: number, nowMs: number): void {
    const sentAtMs = this.pendingPings.get(id);
    if (sentAtMs === undefined) return;
    this.pendingPings.delete(id);
    const sample = Math.max(0, nowMs - sentAtMs);
    if (this.smoothedRttMs === null) this.smoothedRttMs = sample;
    else this.smoothedRttMs += (sample - this.smoothedRttMs) / 8;
    if (this.lastRttMs !== null) {
      this.jitterMs += (Math.abs(sample - this.lastRttMs) - this.jitterMs) / 4;
    }
    this.lastRttMs = sample;
  }

  recordSnapshot(nowMs: number): void {
    this.lastSnapshotAtMs = nowMs;
  }

  recordDroppedSnapshot(): void {
    this.droppedSnapshots += 1;
  }

  stats(nowMs: number): OnlineNetworkStats {
    return {
      rttMs: this.smoothedRttMs,
      jitterMs: this.jitterMs,
      snapshotAgeMs: this.lastSnapshotAtMs === null ? null : Math.max(0, nowMs - this.lastSnapshotAtMs),
      droppedSnapshots: this.droppedSnapshots,
    };
  }
}
