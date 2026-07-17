import type { Dir } from './types.ts';

/**
 * 躲避方向计算（纯函数，便于单测）。
 *
 * 给定一颗来袭子弹的速度矢量、子弹位置与自身位置，
 * 计算应朝哪个「垂直于弹道」的方向侧移，才能最快脱离弹道。
 *
 * 规则：
 * - 子弹主要为水平方向（|vx| >= |vy|）→ 上下躲避；
 *   自身在弹道上方就往上、下方就往下（朝已偏离侧走，脱离最快）。
 * - 子弹主要为垂直方向 → 左右躲避，同理按左右偏移选侧。
 * - 恰好在弹道正中（偏移为 0）时取一个稳定默认值。
 */
export function dodgeDir(
  bulletVx: number,
  bulletVy: number,
  bulletX: number,
  bulletY: number,
  selfX: number,
  selfY: number,
): Dir {
  const speed = Math.hypot(bulletVx, bulletVy) || 1;
  const px = bulletVx / speed;
  const py = bulletVy / speed;

  // 自身相对子弹的位移
  const toSelfX = selfX - bulletX;
  const toSelfY = selfY - bulletY;

  // 侧向分量（垂直于弹道的投影）
  const t = toSelfX * px + toSelfY * py;
  const sideX = toSelfX - t * px;
  const sideY = toSelfY - t * py;

  if (Math.abs(px) >= Math.abs(py)) {
    // 水平弹道 → 垂直躲避
    if (sideY > 0) return 'down';
    if (sideY < 0) return 'up';
    return 'down';
  }
  // 垂直弹道 → 水平躲避
  if (sideX > 0) return 'right';
  if (sideX < 0) return 'left';
  return 'right';
}

/**
 * 判断子弹是否正朝自身逼近且大致会命中（在给定侧向容差内）。
 * 返回 true 表示应触发躲避。
 */
export function bulletThreatens(
  bulletVx: number,
  bulletVy: number,
  bulletX: number,
  bulletY: number,
  selfX: number,
  selfY: number,
  hitTolerance: number,
): boolean {
  const toSelfX = selfX - bulletX;
  const toSelfY = selfY - bulletY;
  // 子弹是否朝自身方向飞（点积 > 0）
  const dot = bulletVx * toSelfX + bulletVy * toSelfY;
  if (dot <= 0) return false;
  const speed = Math.hypot(bulletVx, bulletVy) || 1;
  const px = bulletVx / speed;
  const py = bulletVy / speed;
  const t = toSelfX * px + toSelfY * py;
  const sideX = toSelfX - t * px;
  const sideY = toSelfY - t * py;
  const side = Math.hypot(sideX, sideY);
  return side < hitTolerance;
}
