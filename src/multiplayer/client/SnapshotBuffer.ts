import type {
  OnlineBulletState,
  OnlineEnemyState,
  OnlinePlayerState,
  OnlineSnapshot,
} from '../protocol.ts';

const MIN_INTERVAL_MS = 8;
const MAX_INTERVAL_MS = 100;

export class SnapshotBuffer {
  private previous: OnlineSnapshot | null = null;
  private current: OnlineSnapshot | null = null;
  private receivedAtMs = 0;
  private intervalMs = 1000 / 30;

  push(snapshot: OnlineSnapshot, nowMs: number): void {
    if (this.current && snapshot.elapsedMs < this.current.elapsedMs) return;
    this.previous = this.current;
    if (this.current) {
      this.intervalMs = clamp(
        snapshot.elapsedMs - this.current.elapsedMs,
        MIN_INTERVAL_MS,
        MAX_INTERVAL_MS,
      );
    }
    this.current = snapshot;
    this.receivedAtMs = nowMs;
  }

  sample(nowMs: number, immediatePlayerId?: string): OnlineSnapshot | null {
    if (!this.current) return null;
    if (!this.previous) return this.current;
    const alpha = clamp((nowMs - this.receivedAtMs) / this.intervalMs, 0, 1);
    return {
      ...this.current,
      players: interpolateById(
        this.previous.players,
        this.current.players,
        alpha,
        (player) => player.id === immediatePlayerId,
      ),
      enemies: interpolateById(this.previous.enemies, this.current.enemies, alpha),
      bullets: interpolateById(this.previous.bullets, this.current.bullets, alpha),
    };
  }
}

function interpolateById<T extends OnlinePlayerState | OnlineEnemyState | OnlineBulletState>(
  previous: T[],
  current: T[],
  alpha: number,
  useCurrent: (entity: T) => boolean = () => false,
): T[] {
  const byId = new Map(previous.map((entity) => [entity.id, entity]));
  return current.map((entity) => {
    if (useCurrent(entity)) return entity;
    const before = byId.get(entity.id);
    if (!before) return entity;
    return {
      ...entity,
      x: lerp(before.x, entity.x, alpha),
      y: lerp(before.y, entity.y, alpha),
    };
  });
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
