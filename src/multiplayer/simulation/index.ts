import type { OnlineMode } from '../protocol.ts';
import { BrawlSimulation } from './BrawlSimulation.ts';
import { DuoSimulation } from './DuoSimulation.ts';
import type { MatchSimulation, OnlineParticipant } from './types.ts';

export type { MatchSimulation, OnlineParticipant, SimulationResult } from './types.ts';

export function createOnlineSimulation(
  mode: OnlineMode,
  participants: OnlineParticipant[],
  seed = Date.now(),
): MatchSimulation {
  return mode === 'duo'
    ? new DuoSimulation(participants, seed)
    : new BrawlSimulation(participants, seed);
}
