import type { Dir } from './types.ts';

/**
 * 敌人卡死兜底（纯函数，便于单测）。
 *
 * 问题：敌人贴墙角时，chooseDir 可能反复给出朝目标但被墙挡住的同一方向，
 * 导致 tryMove 一直失败、原地抖动。这里用「连续卡住计数 + 强制脱困方向」破局。
 */

/** 根据本帧是否移动成功，更新连续卡住计数。移动成功归零，失败累加。 */
export function nextStuckCount(prev: number, moved: boolean): number {
  if (moved) return 0;
  return prev + 1;
}

/** 连续卡住达到阈值时，触发强制重选脱困方向。 */
export function shouldForceRepick(stuckCount: number, threshold = 3): boolean {
  return stuckCount >= threshold;
}

/**
 * 选一个脱困方向：优先垂直于当前朝向（打破贴墙抖动），
 * 在两个垂直方向里用 rng 挑一个；rng 无效时回退到反向。
 */
export function escapeDir(current: Dir, rng: () => number): Dir {
  const perpendicular: Dir[] =
    current === 'up' || current === 'down' ? ['left', 'right'] : ['up', 'down'];
  const r = rng();
  const idx = Number.isFinite(r) && r >= 0 && r < 1 ? Math.floor(r * perpendicular.length) : 0;
  const clamped = Math.min(perpendicular.length - 1, Math.max(0, idx));
  return perpendicular[clamped];
}

/** 反向。 */
export function reverseDir(d: Dir): Dir {
  switch (d) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}
