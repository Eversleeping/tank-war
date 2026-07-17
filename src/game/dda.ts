/**
 * 动态难度微调（DDA）状态机的纯逻辑。与实体 / 渲染解耦，便于单测。
 *
 * 目标：在既定难度曲线（difficulty.ts）之上，按玩家近况做小幅加压 / 减压，
 * 让强者更有挑战、弱者少些挫败，而不改变关卡的基础难度设计。
 *
 * 机制（状态机）：
 * - 维护一个整数压力档位 level ∈ [MIN_LEVEL, MAX_LEVEL]，0 为中性。
 * - 连续「无伤通关」累计到阈值 → level +1（加压），并清零无伤连击。
 * - 连续「丢命」累计到阈值 → level -1（减压），并清零丢命连击。
 * - 无伤通关会清零丢命连击，丢命会清零无伤连击（两者互斥推进）。
 *
 * level 换算成对敌人速度 / 射速 / 生成节奏的倍率（见下方 *Multiplier）。
 * 只微调"连续量纲"（速度 / 冷却 / 间隔），不动血量等离散量，避免突兀跳变。
 * 压力档位跨关卡持续，整局有效；开新局重置为初始态。
 */

/** 压力档位范围：-2（最松）… +3（最紧）。 */
export const MIN_LEVEL = -2;
export const MAX_LEVEL = 3;

/** 连续无伤通关多少关加一档压力。 */
export const CLEAN_STREAK_TO_HARDER = 2;
/** 连续丢命多少次减一档压力。 */
export const DEATH_STREAK_TO_EASIER = 2;

export interface DdaState {
  /** 当前压力档位（0 中性，正数更难，负数更易）。 */
  level: number;
  /** 连续无伤通关计数。 */
  cleanStreak: number;
  /** 连续丢命计数。 */
  deathStreak: number;
}

/** 初始（中性）状态。开新局时使用。 */
export function initialDda(): DdaState {
  return { level: 0, cleanStreak: 0, deathStreak: 0 };
}

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(n)));
}

/**
 * 登记一次通关结果，返回新状态（不修改入参）。
 * @param tookDamage 本关玩家是否受创（丢命 / 基地被击中皆算受创，由调用方判定）。
 *
 * 无伤通关：累加无伤连击、清零丢命连击；连击达阈值则升一档并清零连击。
 * 受创通关：无伤连击清零（受创通关不减压，减压只由 registerDeath 触发）。
 */
export function registerStageClear(state: DdaState, tookDamage: boolean): DdaState {
  if (tookDamage) {
    return { ...state, cleanStreak: 0 };
  }
  let cleanStreak = state.cleanStreak + 1;
  let level = state.level;
  if (cleanStreak >= CLEAN_STREAK_TO_HARDER) {
    level = clampLevel(level + 1);
    cleanStreak = 0;
  }
  return { level, cleanStreak, deathStreak: 0 };
}

/**
 * 登记一次玩家丢命，返回新状态（不修改入参）。
 * 累加丢命连击、清零无伤连击；连击达阈值则降一档并清零连击。
 */
export function registerDeath(state: DdaState): DdaState {
  let deathStreak = state.deathStreak + 1;
  let level = state.level;
  if (deathStreak >= DEATH_STREAK_TO_EASIER) {
    level = clampLevel(level - 1);
    deathStreak = 0;
  }
  return { level, cleanStreak: 0, deathStreak };
}

/**
 * 加压倍率（用于"越大越难"的量，如敌人移速）。
 * 每档 ±8%，钳制到 [0.84, 1.24]。level=0 时为 1。
 */
export function intensityMultiplier(state: DdaState): number {
  return 1 + 0.08 * clampLevel(state.level);
}

/**
 * 节奏倍率（用于"越小越难"的量，如开火冷却 / 生成间隔）。
 * 与 intensity 互为倒向：档位越高，冷却 / 间隔越短。
 * 每档 ∓7%，钳制到 [0.79, 1.14]。level=0 时为 1。
 */
export function cadenceMultiplier(state: DdaState): number {
  return 1 - 0.07 * clampLevel(state.level);
}

/** 压力档位的简短展示标签（HUD 用；中性返回空串）。 */
export function ddaLabel(state: DdaState): string {
  const lv = clampLevel(state.level);
  if (lv === 0) return '';
  return lv > 0 ? `压力 +${lv}` : `喘息 ${lv}`;
}
