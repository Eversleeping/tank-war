import { describe, it, expect } from 'vitest';
import { dodgeDir, bulletThreatens } from '../src/game/dodge.ts';

describe('dodgeDir', () => {
  // 水平弹道（子弹向右飞）→ 应上下躲避
  it('子弹水平飞、自身在弹道下方 → 往下躲', () => {
    // 子弹在 (0,0) 向右飞，自身在 (100, 20)：偏在下方
    expect(dodgeDir(300, 0, 0, 0, 100, 20)).toBe('down');
  });

  it('子弹水平飞、自身在弹道上方 → 往上躲', () => {
    expect(dodgeDir(300, 0, 0, 0, 100, -20)).toBe('up');
  });

  it('子弹向左飞、自身在下方 → 仍往下躲', () => {
    // 弹道仍是水平的，偏移方向决定上下
    expect(dodgeDir(-300, 0, 200, 0, 100, 30)).toBe('down');
  });

  // 垂直弹道（子弹向下飞）→ 应左右躲避
  it('子弹垂直飞、自身在弹道右侧 → 往右躲', () => {
    expect(dodgeDir(0, 300, 0, 0, 20, 100)).toBe('right');
  });

  it('子弹垂直飞、自身在弹道左侧 → 往左躲', () => {
    expect(dodgeDir(0, 300, 0, 0, -20, 100)).toBe('left');
  });

  it('子弹向上飞、自身在右侧 → 仍往右躲', () => {
    expect(dodgeDir(0, -300, 0, 200, 25, 100)).toBe('right');
  });

  // 正中弹道 → 稳定默认值（不抛错、不返回空）
  it('自身在弹道正中时返回稳定默认方向', () => {
    const d = dodgeDir(300, 0, 0, 0, 100, 0);
    expect(['up', 'down']).toContain(d);
  });
});

describe('bulletThreatens', () => {
  it('子弹朝自身飞且大致对齐 → 威胁', () => {
    // 子弹在 (0,0) 向右飞，自身在 (100, 5)，侧向 5 < 容差 16
    expect(bulletThreatens(300, 0, 0, 0, 100, 5, 16)).toBe(true);
  });

  it('子弹飞离自身 → 无威胁', () => {
    // 自身在子弹后方
    expect(bulletThreatens(300, 0, 0, 0, -100, 0, 16)).toBe(false);
  });

  it('子弹方向对但侧向偏离过大 → 无威胁', () => {
    expect(bulletThreatens(300, 0, 0, 0, 100, 50, 16)).toBe(false);
  });

  it('容差越大越容易判定为威胁', () => {
    expect(bulletThreatens(300, 0, 0, 0, 100, 30, 16)).toBe(false);
    expect(bulletThreatens(300, 0, 0, 0, 100, 30, 40)).toBe(true);
  });
});
