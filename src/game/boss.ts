import type { Dir } from './types.ts';

/**
 * Boss 生成与数值的纯逻辑。与实体/渲染解耦，便于单测。
 *
 * 规则：每 5 关（5/10/15…）为"难度跃迁关"，该关敌人清空后额外生成一个 Boss，
 * 击破 Boss 才算通关。Boss 高血量、多炮塔齐射。
 */

/** 是否为 Boss 关（每 5 关一次）。 */
export function isBossStage(stage: number): boolean {
  const s = Math.floor(stage);
  return s > 0 && s % 5 === 0;
}

/**
 * Boss 血量：随关卡档位阶梯上升。
 * 第 5 关约 20，之后每个 Boss 关再叠加。
 */
export function bossHp(stage: number): number {
  if (!isBossStage(stage)) return 0;
  const tier = stage / 5; // 1,2,3…
  return 16 + tier * 4;
}

/** Boss 齐射的正向炮塔方向（四向齐射）。 */
export const BOSS_TURRET_DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

/**
 * Boss 齐射的额外斜向数量（用于旋转子弹）。返回夹角（弧度）数组，
 * 叠加在四个正向之间。高档位更多。
 */
export function bossDiagonalAngles(stage: number): number[] {
  if (!isBossStage(stage)) return [];
  const tier = stage / 5;
  // tier1：无斜向；tier2+：四个 45° 斜向
  return tier >= 2 ? [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4] : [];
}

/** Boss 齐射间隔（毫秒）。档位越高越快。 */
export function bossBarrageInterval(stage: number): number {
  if (!isBossStage(stage)) return 0;
  const tier = stage / 5;
  return Math.max(900, 1800 - tier * 150);
}

/** HUD 剩余敌军：生成队列 + 当前存活 + 尚未登场的 Boss。 */
export function remainingEnemyCount(
  stage: number,
  queued: number,
  active: number,
  bossSpawned: boolean,
): number {
  const pendingBoss = isBossStage(stage) && !bossSpawned ? 1 : 0;
  return Math.max(0, Math.floor(queued)) + Math.max(0, Math.floor(active)) + pendingBoss;
}
