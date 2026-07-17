// 单位格尺寸（像素）
export const TILE = 32;

// 每个坦克占 2x2 tile，宽高为 62px（略小于 2 格，避免卡格）
export const TANK_SIZE = TILE * 2 - 2;

// 玩家默认属性
export const PLAYER_SPEED = 160; // px/s
export const PLAYER_LIVES = 3;
export const PLAYER_MAX_HP = 3;
export const RESPAWN_DELAY = 1.2; // s

// 关卡分组尺寸（每 5 关一档升级）
export function mapSize(stage: number): { cols: number; rows: number } {
  const tier = Math.floor((stage - 1) / 5);
  return {
    cols: 25 + tier * 4,
    rows: 19 + tier * 3,
  };
}

// 敌人相关难度维度改由可调曲线表（difficulty.ts）驱动，此处统一再导出，
// 使游戏侧仍从 constants 单点引入，调平衡只需改曲线表。
export {
  aiTier,
  enemyFireCd,
  enemyHp,
  enemyMaxOnScreen,
  enemyRank,
  enemySpawnInterval,
  enemySpeed,
  enemyTotal,
} from './difficulty.ts';

// 每关基础通关奖励（分）
export function stageBonus(stage: number): number {
  return 500 + stage * 50;
}

// 击杀奖励
export const KILL_SCORE = 100;
