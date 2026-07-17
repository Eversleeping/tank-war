import type { Dir } from './types.ts';

/**
 * 关卡负面事件的纯逻辑。与实体/渲染解耦，便于单测。
 *
 * 两种负面事件，随机在部分关卡触发，仅持续本关：
 * - fog：视野受限（渲染时只显示玩家周围一圈）
 * - slippery：地面打滑（松开方向键后仍会惯性滑行一小段）
 *
 * 触发规则：第 1 关与 Boss 关（每 5 关）不触发；其余关卡按随概率触发，
 * 关卡越高概率越大（有上限）。
 */

export type StageEventKind = 'none' | 'fog' | 'slippery';

export interface StageEventInfo {
  kind: StageEventKind;
  name: string;
  desc: string;
}

const EVENT_INFO: Record<StageEventKind, StageEventInfo> = {
  none: { kind: 'none', name: '', desc: '' },
  fog: { kind: 'fog', name: '战争迷雾', desc: '视野受限，只能看清坦克周围。' },
  slippery: { kind: 'slippery', name: '地面结冰', desc: '地面打滑，松开方向后仍会滑行。' },
};

/** 取事件的展示信息。 */
export function stageEventInfo(kind: StageEventKind): StageEventInfo {
  return EVENT_INFO[kind];
}

/** 该关是否允许触发负面事件（第 1 关、Boss 关不触发）。 */
export function canTriggerEvent(stage: number): boolean {
  const s = Math.floor(stage);
  if (s <= 1) return false;
  if (s % 5 === 0) return false; // Boss 关专注打 Boss
  return true;
}

/** 负面事件触发概率：随关卡线性上升，封顶 0.5。 */
export function eventChance(stage: number): number {
  if (!canTriggerEvent(stage)) return 0;
  const s = Math.floor(stage);
  return Math.min(0.5, 0.12 + 0.03 * (s - 2));
}

/**
 * 掷一次决定本关的负面事件。
 * 先按 eventChance 决定是否触发，再在 fog / slippery 间等概率二选一。
 */
export function rollStageEvent(stage: number, rng: () => number): StageEventKind {
  if (!canTriggerEvent(stage)) return 'none';
  if (rng() >= eventChance(stage)) return 'none';
  return rng() < 0.5 ? 'fog' : 'slippery';
}

/** fog 事件下的可视半径（像素）。 */
export function fogRadiusPx(tile: number): number {
  return tile * 5;
}

/** slippery 事件下松开方向键后的滑行时长（毫秒）。 */
export const SLIP_DRIFT_MS = 420;

/**
 * 打滑时的行进方向决策（纯函数）。
 *
 * - 有输入方向：采用输入方向，滑行计时重置为满值。
 * - 无输入方向：若仍有滑行余量，沿上一次方向继续滑行；否则停下。
 *
 * 返回本帧应行进的方向（null = 不动）与更新后的滑行计时。
 */
export function driftStep(
  inputDir: Dir | null,
  lastDir: Dir | null,
  driftMs: number,
  dtMs: number,
): { dir: Dir | null; driftMs: number } {
  if (inputDir) {
    return { dir: inputDir, driftMs: SLIP_DRIFT_MS };
  }
  const remaining = Math.max(0, driftMs - dtMs);
  if (remaining > 0 && lastDir) {
    return { dir: lastDir, driftMs: remaining };
  }
  return { dir: null, driftMs: 0 };
}
