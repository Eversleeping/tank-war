export class FixedStepClock {
  readonly stepSeconds: number;
  readonly stepMs: number;
  readonly pollIntervalMs: number;

  private accumulatorMs = 0;
  private lastMs: number;
  private readonly maxCatchUpSteps: number;

  constructor(hz: number, maxCatchUpSteps: number, nowMs: number) {
    if (!Number.isFinite(hz) || hz <= 0) throw new Error('Fixed-step frequency must be positive');
    this.stepSeconds = 1 / hz;
    this.stepMs = 1000 / hz;
    this.pollIntervalMs = Math.max(1, this.stepMs / 2);
    this.maxCatchUpSteps = Math.max(1, Math.floor(maxCatchUpSteps));
    this.lastMs = nowMs;
  }

  advance(nowMs: number): number {
    const elapsedMs = Math.max(0, nowMs - this.lastMs);
    this.lastMs = Math.max(this.lastMs, nowMs);
    this.accumulatorMs += Math.min(elapsedMs, this.stepMs * this.maxCatchUpSteps);
    const steps = Math.min(
      this.maxCatchUpSteps,
      Math.floor((this.accumulatorMs + Number.EPSILON) / this.stepMs),
    );
    this.accumulatorMs -= steps * this.stepMs;
    if (steps === this.maxCatchUpSteps && this.accumulatorMs >= this.stepMs) {
      this.accumulatorMs %= this.stepMs;
    }
    return steps;
  }
}
