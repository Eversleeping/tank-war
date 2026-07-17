import { describe, it, expect } from 'vitest';
import { advanceFlags, effectiveDt, type LoopStatus } from '../src/game/loopPolicy.ts';

const ALL: LoopStatus[] = [
  'menu',
  'playing',
  'stage-clear',
  'pickup',
  'paused',
  'game-over',
  'transition',
];

describe('advanceFlags', () => {
  it('仅 playing 推进世界与特效', () => {
    for (const s of ALL) {
      const f = advanceFlags(s);
      if (s === 'playing') {
        expect(f).toEqual({ world: true, effects: true });
      } else {
        expect(f).toEqual({ world: false, effects: false });
      }
    }
  });
});

describe('effectiveDt', () => {
  it('playing 态返回原 dt（受上限保护）', () => {
    expect(effectiveDt(0.016, 'playing')).toBeCloseTo(0.016, 6);
    expect(effectiveDt(10, 'playing')).toBe(0.05); // 上限
  });

  it('冻结态一律返回 0，即使传入正常 dt', () => {
    for (const s of ALL) {
      if (s === 'playing') continue;
      expect(effectiveDt(0.016, s)).toBe(0);
    }
  });

  it('非法 dt（NaN / 负 / 0）返回 0', () => {
    expect(effectiveDt(NaN, 'playing')).toBe(0);
    expect(effectiveDt(-1, 'playing')).toBe(0);
    expect(effectiveDt(0, 'playing')).toBe(0);
  });

  it('自定义上限生效', () => {
    expect(effectiveDt(1, 'playing', 0.1)).toBe(0.1);
  });
});
