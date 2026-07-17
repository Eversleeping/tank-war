import type { BulletKind } from '../../game/BulletKind.ts';
import type { Dir } from '../../game/types.ts';
import { ONLINE_INPUT_HEARTBEAT_HZ } from '../protocol.ts';

export interface OnlineInputPayload {
  dir: Dir | null;
  firing: boolean;
  weapon: BulletKind;
}

export class InputSyncPolicy {
  private heartbeatTimerMs = 0;
  private lastSent: OnlineInputPayload | null = null;

  shouldSend(
    next: OnlineInputPayload,
    dtSeconds: number,
    allowHeartbeat: boolean,
    force = false,
  ): boolean {
    this.heartbeatTimerMs -= Math.max(0, dtSeconds) * 1000;
    const changed = !this.lastSent
      || this.lastSent.dir !== next.dir
      || this.lastSent.firing !== next.firing
      || this.lastSent.weapon !== next.weapon;
    if (!force && !changed && (!allowHeartbeat || this.heartbeatTimerMs > 0)) return false;
    this.lastSent = { ...next };
    this.heartbeatTimerMs = 1000 / ONLINE_INPUT_HEARTBEAT_HZ;
    return true;
  }
}
