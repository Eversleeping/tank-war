import { describe, it, expect } from 'vitest';
import {
  canTriggerEvent,
  driftStep,
  eventChance,
  fogRadiusPx,
  rollStageEvent,
  SLIP_DRIFT_MS,
  stageEventInfo,
} from '../src/game/events.ts';

/** 确定性 RNG：给定序列。 */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('canTriggerEvent', () => {
  it('第 1 关不触发', () => {
    expect(canTriggerEvent(1)).toBe(false);
  });

  it('Boss 关（每 5 关）不触发', () => {
    expect(canTriggerEvent(5)).toBe(false);
    expect(canTriggerEvent(10)).toBe(false);
    expect(canTriggerEvent(15)).toBe(false);
  });

  it('普通关触发', () => {
    expect(canTriggerEvent(2)).toBe(true);
    expect(canTriggerEvent(7)).toBe(true);
  });
});

describe('eventChance', () => {
  it('不可触发关卡概率为 0', () => {
    expect(eventChance(1)).toBe(0);
    expect(eventChance(5)).toBe(0);
  });

  it('随关卡上升且封顶 0.5', () => {
    expect(eventChance(2)).toBeCloseTo(0.12);
    expect(eventChance(3)).toBeCloseTo(0.15);
    expect(eventChance(99)).toBe(0.5);
  });
});

describe('rollStageEvent', () => {
  it('不可触发关卡始终返回 none', () => {
    expect(rollStageEvent(1, seq([0]))).toBe('none');
    expect(rollStageEvent(5, seq([0]))).toBe('none');
  });

  it('掷值超过概率阈值时不触发', () => {
    // stage 2 概率 0.12，掷 0.9 > 0.12 → none
    expect(rollStageEvent(2, seq([0.9]))).toBe('none');
  });

  it('触发后按第二个随机数二选一', () => {
    // 第一个 0 < 0.12 触发；第二个 0.1 < 0.5 → fog
    expect(rollStageEvent(2, seq([0, 0.1]))).toBe('fog');
    // 第二个 0.8 >= 0.5 → slippery
    expect(rollStageEvent(2, seq([0, 0.8]))).toBe('slippery');
  });
});

describe('stageEventInfo', () => {
  it('每种事件都有名称与描述（none 除外）', () => {
    expect(stageEventInfo('fog').name).not.toBe('');
    expect(stageEventInfo('slippery').name).not.toBe('');
    expect(stageEventInfo('none').name).toBe('');
  });
});

describe('fogRadiusPx', () => {
  it('随 tile 尺寸线性缩放', () => {
    expect(fogRadiusPx(32)).toBe(160);
    expect(fogRadiusPx(10)).toBe(50);
  });
});

describe('driftStep', () => {
  it('有输入方向：采用输入方向并把滑行计时充满', () => {
    const r = driftStep('up', 'left', 0, 16);
    expect(r.dir).toBe('up');
    expect(r.driftMs).toBe(SLIP_DRIFT_MS);
  });

  it('无输入但有余量：沿上一次方向继续滑行并递减计时', () => {
    const r = driftStep(null, 'right', 200, 16);
    expect(r.dir).toBe('right');
    expect(r.driftMs).toBe(184);
  });

  it('无输入且计时耗尽：停下', () => {
    const r = driftStep(null, 'down', 10, 16);
    expect(r.dir).toBe(null);
    expect(r.driftMs).toBe(0);
  });

  it('无输入且无上一次方向：不动', () => {
    const r = driftStep(null, null, 200, 16);
    expect(r.dir).toBe(null);
  });
});
