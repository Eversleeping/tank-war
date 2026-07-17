import { describe, it, expect } from 'vitest';
import {
  cadenceMultiplier,
  ddaLabel,
  initialDda,
  intensityMultiplier,
  registerDeath,
  registerStageClear,
  MAX_LEVEL,
  MIN_LEVEL,
  CLEAN_STREAK_TO_HARDER,
  DEATH_STREAK_TO_EASIER,
  type DdaState,
} from '../src/game/dda.ts';

describe('initialDda', () => {
  it('中性初态', () => {
    expect(initialDda()).toEqual({ level: 0, cleanStreak: 0, deathStreak: 0 });
  });
});

describe('registerStageClear', () => {
  it('单次无伤通关只累计连击，不足阈值不升档', () => {
    const s = registerStageClear(initialDda(), false);
    expect(s.level).toBe(0);
    expect(s.cleanStreak).toBe(1);
  });

  it('连续无伤达阈值升一档并清零连击', () => {
    let s = initialDda();
    for (let i = 0; i < CLEAN_STREAK_TO_HARDER; i++) s = registerStageClear(s, false);
    expect(s.level).toBe(1);
    expect(s.cleanStreak).toBe(0);
  });

  it('受创通关打断无伤连击且不升档', () => {
    let s = registerStageClear(initialDda(), false); // cleanStreak=1
    s = registerStageClear(s, true);
    expect(s.level).toBe(0);
    expect(s.cleanStreak).toBe(0);
  });

  it('无伤通关清零丢命连击', () => {
    let s = registerDeath(initialDda()); // deathStreak=1
    s = registerStageClear(s, false);
    expect(s.deathStreak).toBe(0);
    expect(s.cleanStreak).toBe(1);
  });

  it('不修改入参（纯函数）', () => {
    const s0 = initialDda();
    registerStageClear(s0, false);
    expect(s0).toEqual({ level: 0, cleanStreak: 0, deathStreak: 0 });
  });

  it('升档不超过 MAX_LEVEL', () => {
    let s: DdaState = { level: MAX_LEVEL, cleanStreak: 0, deathStreak: 0 };
    for (let i = 0; i < CLEAN_STREAK_TO_HARDER * 3; i++) s = registerStageClear(s, false);
    expect(s.level).toBe(MAX_LEVEL);
  });
});

describe('registerDeath', () => {
  it('单次丢命只累计连击，不足阈值不降档', () => {
    const s = registerDeath(initialDda());
    expect(s.level).toBe(0);
    expect(s.deathStreak).toBe(1);
  });

  it('连续丢命达阈值降一档并清零连击', () => {
    let s = initialDda();
    for (let i = 0; i < DEATH_STREAK_TO_EASIER; i++) s = registerDeath(s);
    expect(s.level).toBe(-1);
    expect(s.deathStreak).toBe(0);
  });

  it('丢命清零无伤连击', () => {
    let s = registerStageClear(initialDda(), false); // cleanStreak=1
    s = registerDeath(s);
    expect(s.cleanStreak).toBe(0);
    expect(s.deathStreak).toBe(1);
  });

  it('降档不低于 MIN_LEVEL', () => {
    let s: DdaState = { level: MIN_LEVEL, cleanStreak: 0, deathStreak: 0 };
    for (let i = 0; i < DEATH_STREAK_TO_EASIER * 3; i++) s = registerDeath(s);
    expect(s.level).toBe(MIN_LEVEL);
  });
});

describe('加压 / 减压往返', () => {
  it('先连胜升档，再连败降回', () => {
    let s = initialDda();
    s = registerStageClear(s, false);
    s = registerStageClear(s, false); // level 1
    expect(s.level).toBe(1);
    s = registerDeath(s);
    s = registerDeath(s); // level 0
    expect(s.level).toBe(0);
  });
});

describe('intensityMultiplier', () => {
  it('中性档为 1', () => {
    expect(intensityMultiplier(initialDda())).toBeCloseTo(1);
  });

  it('随档位单调递增，最紧 > 最松', () => {
    const hard = intensityMultiplier({ level: MAX_LEVEL, cleanStreak: 0, deathStreak: 0 });
    const easy = intensityMultiplier({ level: MIN_LEVEL, cleanStreak: 0, deathStreak: 0 });
    expect(hard).toBeGreaterThan(1);
    expect(easy).toBeLessThan(1);
    expect(hard).toBeGreaterThan(easy);
  });

  it('越界档位被钳制', () => {
    const a = intensityMultiplier({ level: 999, cleanStreak: 0, deathStreak: 0 });
    const b = intensityMultiplier({ level: MAX_LEVEL, cleanStreak: 0, deathStreak: 0 });
    expect(a).toBe(b);
  });
});

describe('cadenceMultiplier', () => {
  it('中性档为 1', () => {
    expect(cadenceMultiplier(initialDda())).toBeCloseTo(1);
  });

  it('档位越高节奏越短（倍率越小）', () => {
    const hard = cadenceMultiplier({ level: MAX_LEVEL, cleanStreak: 0, deathStreak: 0 });
    const easy = cadenceMultiplier({ level: MIN_LEVEL, cleanStreak: 0, deathStreak: 0 });
    expect(hard).toBeLessThan(1);
    expect(easy).toBeGreaterThan(1);
    expect(hard).toBeLessThan(easy);
  });
});

describe('ddaLabel', () => {
  it('中性档无标签', () => {
    expect(ddaLabel(initialDda())).toBe('');
  });

  it('正档显示压力，负档显示喘息', () => {
    expect(ddaLabel({ level: 2, cleanStreak: 0, deathStreak: 0 })).toContain('压力');
    expect(ddaLabel({ level: -1, cleanStreak: 0, deathStreak: 0 })).toContain('喘息');
  });
});
