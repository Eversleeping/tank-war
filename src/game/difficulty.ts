/**
 * 难度曲线表（纯逻辑）。与实体 / 渲染解耦，便于单测。
 *
 * 把原先散落在 constants 里的线性公式统一成"可调曲线表"：每个难度维度用
 * 一组按 stage 升序的 (stage, value) 关键帧描述，关卡落在关键帧之间时做
 * 分段线性插值；落在首帧之前 / 末帧之后则钳制到端点值。
 *
 * 好处：
 * - 难度调整只需改表里的关键帧，无需改动公式；
 * - 能表达"前期平缓、中期陡升、后期封顶"这类非线性曲线；
 * - 末帧天然成为该维度的上 / 下限，endless 模式不会无限膨胀。
 *
 * 离散维度（数量 / 血量 / 档位）在采样后取整并钳制到各自合法范围。
 */

export interface CurvePoint {
  /** 关卡号（曲线横坐标） */
  stage: number;
  /** 该关卡对应的难度取值（曲线纵坐标） */
  value: number;
}

/** 关键帧曲线：按 stage 升序的一组控制点，至少 1 个。 */
export type Curve = readonly CurvePoint[];

/**
 * 分段线性采样：
 * - stage ≤ 首帧 stage：返回首帧值；
 * - stage ≥ 末帧 stage：返回末帧值（即该维度的上 / 下限）；
 * - 落在两帧之间：按占比线性插值。
 *
 * 要求 points 非空且按 stage 升序。关键帧 stage 重叠时退化取右端值。
 */
export function sampleCurve(points: Curve, stage: number): number {
  const n = points.length;
  if (n === 0) throw new Error('difficulty curve must have at least one point');
  const first = points[0];
  if (stage <= first.stage) return first.value;
  const last = points[n - 1];
  if (stage >= last.stage) return last.value;
  for (let i = 1; i < n; i++) {
    const b = points[i];
    if (stage <= b.stage) {
      const a = points[i - 1];
      const span = b.stage - a.stage;
      if (span <= 0) return b.value;
      const t = (stage - a.stage) / span;
      return a.value + t * (b.value - a.value);
    }
  }
  return last.value; // 理论到不了（上面已处理 stage ≥ 末帧）
}

// ---- 各难度维度的曲线表（改这里即可调平衡） ----

/** 每关敌人总数：前期温和，后期封顶 40。 */
const ENEMY_TOTAL: Curve = [
  { stage: 1, value: 8 },
  { stage: 5, value: 12 },
  { stage: 10, value: 18 },
  { stage: 15, value: 24 },
  { stage: 20, value: 30 },
  { stage: 30, value: 40 },
];

/** 同屏敌人上限：4 → 8，封顶 8。 */
const ENEMY_MAX_ON_SCREEN: Curve = [
  { stage: 1, value: 4 },
  { stage: 6, value: 5 },
  { stage: 11, value: 6 },
  { stage: 16, value: 7 },
  { stage: 21, value: 8 },
];

/** 敌人 AI 档位：1 → 5，封顶 5。 */
const AI_TIER: Curve = [
  { stage: 1, value: 1 },
  { stage: 6, value: 2 },
  { stage: 11, value: 3 },
  { stage: 16, value: 4 },
  { stage: 21, value: 5 },
];

/** 敌人血量：1 → 6，封顶 6（避免后期沦为血包战）。 */
const ENEMY_HP: Curve = [
  { stage: 1, value: 1 },
  { stage: 5, value: 1 },
  { stage: 10, value: 2 },
  { stage: 15, value: 3 },
  { stage: 20, value: 4 },
  { stage: 25, value: 5 },
  { stage: 30, value: 6 },
];

/** 敌人移速（px/s）：90 → 165，封顶 165。 */
const ENEMY_SPEED: Curve = [
  { stage: 1, value: 90 },
  { stage: 6, value: 102 },
  { stage: 11, value: 114 },
  { stage: 16, value: 126 },
  { stage: 21, value: 138 },
  { stage: 26, value: 150 },
  { stage: 31, value: 165 },
];

/** 敌人开火冷却（ms，越小越猛）：1360 → 320，地板 320。 */
const ENEMY_FIRE_CD: Curve = [
  { stage: 1, value: 1360 },
  { stage: 5, value: 1180 },
  { stage: 10, value: 940 },
  { stage: 15, value: 700 },
  { stage: 20, value: 480 },
  { stage: 27, value: 320 },
];

/** 敌人生成间隔（ms，越小越密）：3080 → 1100，地板 1100。 */
const ENEMY_SPAWN_INTERVAL: Curve = [
  { stage: 1, value: 3080 },
  { stage: 5, value: 2600 },
  { stage: 10, value: 2000 },
  { stage: 15, value: 1500 },
  { stage: 20, value: 1100 },
];

// ---- 由曲线派生的难度取值函数（离散维度取整并钳制） ----

/** 每关敌人总数（取整，下限 1）。 */
export function enemyTotal(stage: number): number {
  return Math.max(1, Math.round(sampleCurve(ENEMY_TOTAL, stage)));
}

/** 同屏最多敌人数（取整，钳制到 [1, 8]）。 */
export function enemyMaxOnScreen(stage: number): number {
  return Math.max(1, Math.min(8, Math.round(sampleCurve(ENEMY_MAX_ON_SCREEN, stage))));
}

/** 敌人 AI 档位（取整，钳制到 1-5）。 */
export function aiTier(stage: number): 1 | 2 | 3 | 4 | 5 {
  const t = Math.round(sampleCurve(AI_TIER, stage));
  return Math.max(1, Math.min(5, t)) as 1 | 2 | 3 | 4 | 5;
}

/**
 * 敌军装备等级：用于同步驱动外形与个体强化。
 * 1-7 关为 I 型，8-15 关为 II 型，16 关后为 III 型。
 */
export function enemyRank(stage: number): 1 | 2 | 3 {
  const s = Math.max(1, Math.floor(stage));
  if (s >= 16) return 3;
  if (s >= 8) return 2;
  return 1;
}

/** 敌人血量（取整，下限 1）。 */
export function enemyHp(stage: number): number {
  return Math.max(1, Math.round(sampleCurve(ENEMY_HP, stage)));
}

/** 敌人移速（px/s，取整）。 */
export function enemySpeed(stage: number): number {
  return Math.round(sampleCurve(ENEMY_SPEED, stage));
}

/** 敌人开火冷却（ms，取整）。 */
export function enemyFireCd(stage: number): number {
  return Math.round(sampleCurve(ENEMY_FIRE_CD, stage));
}

/** 敌人生成间隔（ms，取整）。 */
export function enemySpawnInterval(stage: number): number {
  return Math.round(sampleCurve(ENEMY_SPAWN_INTERVAL, stage));
}
