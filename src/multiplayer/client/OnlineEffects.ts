import type { OnlineCombatEffect } from '../protocol.ts';

export function unseenCombatEffects(
  effects: readonly OnlineCombatEffect[],
  lastSeenId: number,
): { effects: OnlineCombatEffect[]; lastSeenId: number } {
  const unseen = effects
    .filter((effect) => effect.id > lastSeenId)
    .sort((a, b) => a.id - b.id);
  let nextLastSeenId = lastSeenId;
  for (const effect of unseen) nextLastSeenId = Math.max(nextLastSeenId, effect.id);
  return { effects: unseen, lastSeenId: nextLastSeenId };
}

export function hasNearbyDestruction(
  effects: readonly OnlineCombatEffect[],
  x: number,
  y: number,
  radius = 48,
): boolean {
  const radiusSq = radius * radius;
  return effects.some((effect) => {
    if (effect.type !== 'destroyed') return false;
    const dx = effect.x - x;
    const dy = effect.y - y;
    return dx * dx + dy * dy <= radiusSq;
  });
}
