import { describe, it, expect } from 'vitest';
import {
  nextStuckCount,
  shouldForceRepick,
  escapeDir,
  reverseDir,
} from '../src/game/stuck.ts';
import type { Dir } from '../src/game/types.ts';

describe('nextStuckCount', () => {
  it('移动成功时归零', () => {
    expect(nextStuckCount(5, true)).toBe(0);
    expect(nextStuckCount(0, true)).toBe(0);
  });

  it('移动失败时累加', () => {
    expect(nextStuckCount(0, false)).toBe(1);
    expect(nextStuckCount(2, false)).toBe(3);
  });
});

describe('shouldForceRepick', () => {
  it('未达阈值不触发', () => {
    expect(shouldForceRepick(0)).toBe(false);
    expect(shouldForceRepick(2)).toBe(false);
  });

  it('达到默认阈值 3 触发', () => {
    expect(shouldForceRepick(3)).toBe(true);
    expect(shouldForceRepick(10)).toBe(true);
  });

  it('阈值可自定义', () => {
    expect(shouldForceRepick(2, 2)).toBe(true);
    expect(shouldForceRepick(1, 2)).toBe(false);
  });
});

describe('escapeDir', () => {
  it('当前为垂直朝向时选水平脱困方向', () => {
    expect(escapeDir('up', () => 0)).toBe('left');
    expect(escapeDir('up', () => 0.99)).toBe('right');
    expect(escapeDir('down', () => 0)).toBe('left');
    expect(escapeDir('down', () => 0.99)).toBe('right');
  });

  it('当前为水平朝向时选垂直脱困方向', () => {
    expect(escapeDir('left', () => 0)).toBe('up');
    expect(escapeDir('left', () => 0.99)).toBe('down');
    expect(escapeDir('right', () => 0)).toBe('up');
    expect(escapeDir('right', () => 0.99)).toBe('down');
  });

  it('rng 无效时回退到第一个垂直方向', () => {
    expect(escapeDir('up', () => NaN)).toBe('left');
    expect(escapeDir('left', () => -1)).toBe('up');
  });

  it('脱困方向始终垂直于当前朝向', () => {
    const dirs: Dir[] = ['up', 'down', 'left', 'right'];
    for (const d of dirs) {
      const horizontalIn = d === 'left' || d === 'right';
      const out = escapeDir(d, () => 0.5);
      const horizontalOut = out === 'left' || out === 'right';
      expect(horizontalOut).toBe(!horizontalIn);
    }
  });
});

describe('reverseDir', () => {
  it('返回相反方向', () => {
    expect(reverseDir('up')).toBe('down');
    expect(reverseDir('down')).toBe('up');
    expect(reverseDir('left')).toBe('right');
    expect(reverseDir('right')).toBe('left');
  });
});
