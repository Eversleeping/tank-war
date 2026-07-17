/** 基地紧急维修后的无敌时间。 */
export const BASE_REPAIR_SHIELD_MS = 5000;

/** 基地耐久随关卡缓慢成长，避免敌军伤害成长后再次退化为一击失败。 */
export function baseMaxHpForStage(stage: number): number {
  const s = Math.max(1, Math.floor(stage));
  return Math.min(8, 5 + Math.floor((s - 1) / 8));
}

export interface BaseBreachOutcome {
  lives: number;
  repairHp: number;
  gameOver: boolean;
}

/** 基地失守时优先消耗一条备用生命；无备用生命才结束游戏。 */
export function resolveBaseBreach(lives: number, maxHp: number): BaseBreachOutcome {
  const reserves = Math.max(0, Math.floor(lives));
  if (reserves <= 0) return { lives: 0, repairHp: 0, gameOver: true };
  return {
    lives: reserves - 1,
    repairHp: Math.max(1, Math.ceil(maxHp / 2)),
    gameOver: false,
  };
}
