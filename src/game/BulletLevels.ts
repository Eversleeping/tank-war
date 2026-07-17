import type { BulletSpec } from './BulletTypes.ts';

/** 炮弹可升级到的最高等级（含 1 级初始）。 */
export const MAX_BULLET_LEVEL = 5;

/**
 * 依据等级放大炮弹规格。等级 1 即基础规格（原样返回同一对象）。
 *
 * 升级规则（每级 = step 累加，step = level - 1）：
 * - 伤害：每级 +1
 * - 冷却：每级 -9%，下限为基础冷却的 55%（即射速上限）
 * - 视觉半径：每级 +0.5
 * - 强化各弹种的标志能力（仅在基础已具备该能力时叠加，保持弹种个性）：
 *   - 穿透 pierce：每级 +1
 *   - 反弹 bounces：每级 +1
 *   - 爆炸半径 explosionRadius：每级 +8
 *   - 冻结时长 freezeMs：每级 +400
 *   - 散射发数 spread：每 2 级 +2 发
 *
 * 纯函数：不修改传入的 base。
 */
export function applyBulletLevel(base: BulletSpec, level: number): BulletSpec {
  const lv = clampLevel(level);
  const step = lv - 1;
  if (step === 0) return base;

  const spec: BulletSpec = { ...base };
  spec.damage = base.damage + step;
  spec.cooldown = Math.round(
    Math.max(base.cooldown * 0.55, base.cooldown * (1 - 0.09 * step)),
  );
  spec.energyCost = Math.round(Math.max(base.energyCost * 0.7, base.energyCost * (1 - 0.06 * step)));
  spec.size = base.size + step * 0.5;

  if (base.pierce > 0) spec.pierce = base.pierce + step;
  if (base.bounces > 0) spec.bounces = base.bounces + step;
  if (base.explosionRadius > 0) spec.explosionRadius = base.explosionRadius + step * 8;
  if (base.freezeMs > 0) spec.freezeMs = base.freezeMs + step * 400;
  if (base.spread > 1) spec.spread = base.spread + Math.floor(step / 2) * 2;
  if ((base.burnMs ?? 0) > 0) spec.burnMs = base.burnMs! + step * 400;
  if ((base.burnDamage ?? 0) > 0) spec.burnDamage = base.burnDamage! + Math.floor(step / 2);
  if ((base.chainTargets ?? 0) > 0) spec.chainTargets = base.chainTargets! + Math.floor(step / 2);
  if ((base.chainRadius ?? 0) > 0) spec.chainRadius = base.chainRadius! + step * 12;
  if ((base.knockback ?? 0) > 0) spec.knockback = base.knockback! + step * 10;

  return spec;
}

/** 把任意输入等级夹到 [1, MAX_BULLET_LEVEL] 的整数。 */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(MAX_BULLET_LEVEL, Math.floor(level)));
}

/** 升一级并返回新等级（已达上限则维持上限）。用于重复拾取同弹种。 */
export function nextLevel(level: number): number {
  return clampLevel(clampLevel(level) + 1);
}
