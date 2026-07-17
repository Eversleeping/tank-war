/**
 * 主循环推进策略（纯函数，便于单测）。
 *
 * 决定给定游戏状态下，主循环该不该推进「世界物理」与「视觉特效」。
 * 核心目标：暂停 / 弹窗态下完全冻结，dt 不累积到任何实体或特效。
 */

export type LoopStatus =
  | 'menu'
  | 'playing'
  | 'stage-clear'
  | 'pickup'
  | 'paused'
  | 'game-over'
  | 'transition';

export interface AdvanceFlags {
  /** 是否推进世界物理（坦克 / 子弹 / 道具 / AI / 生成 / 计时） */
  world: boolean;
  /** 是否推进视觉特效（爆炸 / 枪口闪光 / 水波动画） */
  effects: boolean;
}

/**
 * 唯有 'playing' 状态推进世界与特效。
 * 其余状态（菜单、暂停、通关结算、拾取、Game Over、过场）全部冻结。
 */
export function advanceFlags(status: LoopStatus): AdvanceFlags {
  const playing = status === 'playing';
  return { world: playing, effects: playing };
}

/**
 * 计算本帧有效 dt。冻结态返回 0，保证即使误传 dt 也不会推进任何状态。
 * 同时对 dt 做上限保护（切后台回来时时间戳跳变，避免一帧巨步穿墙）。
 */
export function effectiveDt(rawDt: number, status: LoopStatus, maxDt = 0.05): number {
  if (!advanceFlags(status).world) return 0;
  if (!Number.isFinite(rawDt) || rawDt <= 0) return 0;
  return Math.min(maxDt, rawDt);
}
