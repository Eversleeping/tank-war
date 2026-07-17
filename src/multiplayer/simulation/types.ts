import type { OnlineInputState, OnlineMode, OnlineSnapshot } from '../protocol.ts';
import type { BulletKind } from '../../game/BulletKind.ts';

export interface OnlineParticipant {
  id: string;
  name: string;
}

export interface SimulationResult {
  winnerId: string | null;
  winnerName: string;
  reason: string;
}

export interface MatchSimulation {
  readonly mode: OnlineMode;
  readonly worldVersion: number;
  readonly result: SimulationResult | null;
  setInput(playerId: string, input: OnlineInputState): void;
  choosePickup?(playerId: string, weapon: BulletKind): boolean;
  step(dt: number): void;
  snapshot(includeWorld?: boolean): OnlineSnapshot;
}
