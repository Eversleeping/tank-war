/**
 * 持续增益（buff）纯逻辑。与实体解耦，便于单测。
 *
 * 三种持续增益，效果累加并持续到本局结束：
 * - haste：移速 +
 * - rapidFire：射速 +（冷却缩短）
 * - regen：护盾再生（每隔一段时间恢复 1 点 HP，直至上限）
 *
 * 采用"层数"模型：同种 buff 可叠加多层，效果按层线性增强（有上限）。
 */

export type BuffKind = 'haste' | 'rapidFire' | 'regen';

/** 每种 buff 的最大叠加层数。 */
export const MAX_BUFF_STACKS = 3;

export interface BuffState {
  haste: number;
  rapidFire: number;
  regen: number;
}

/** 空 buff 状态（新一局开始时的初始值）。 */
export function emptyBuffs(): BuffState {
  return { haste: 0, rapidFire: 0, regen: 0 };
}

/** 叠加一层某 buff，返回新状态（不修改入参）。层数封顶。 */
export function addBuff(state: BuffState, kind: BuffKind, stacks = 1): BuffState {
  const next = { ...state };
  next[kind] = clampStacks(state[kind] + stacks);
  return next;
}

/** 移速倍率：每层 haste +18%，封顶 +54%。 */
export function speedMultiplier(state: BuffState): number {
  return 1 + 0.18 * clampStacks(state.haste);
}

/** 冷却倍率：每层 rapidFire -15%，封顶 -45%（即冷却 ×0.55）。 */
export function cooldownMultiplier(state: BuffState): number {
  return Math.max(0.4, 1 - 0.15 * clampStacks(state.rapidFire));
}

/**
 * 护盾再生间隔（毫秒）。层数越高恢复越快；0 层表示不再生（返回 Infinity）。
 * 1 层 6s，2 层 4.5s，3 层 3s。
 */
export function regenIntervalMs(state: BuffState): number {
  const s = clampStacks(state.regen);
  if (s <= 0) return Infinity;
  return 7500 - s * 1500;
}

function clampStacks(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_BUFF_STACKS, Math.floor(n)));
}

/** 把 PowerUp 道具类型映射到 buff 类型（非 buff 道具返回 null）。 */
export function powerUpToBuff(kind: string): BuffKind | null {
  switch (kind) {
    case 'speed':
      return 'haste';
    case 'rapid':
      return 'rapidFire';
    case 'regen':
      return 'regen';
    default:
      return null;
  }
}
