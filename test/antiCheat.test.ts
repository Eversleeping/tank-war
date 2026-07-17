import { describe, it, expect } from 'vitest';
import {
  fnv1a,
  killsUpperBound,
  scoreUpperBound,
  signPayload,
  validatePayload,
  verifySignature,
  type ScorePayload,
} from '../src/storage/antiCheat.ts';

/** 构造一个合法基线载荷。 */
function payload(over: Partial<ScorePayload> = {}): ScorePayload {
  return { mode: 'single', name: 'A', score: 1000, stage: 3, kills: 10, ...over };
}

describe('scoreUpperBound', () => {
  it('随关卡与击杀单调不减', () => {
    expect(scoreUpperBound(2, 5)).toBeGreaterThan(scoreUpperBound(1, 5));
    expect(scoreUpperBound(3, 10)).toBeGreaterThan(scoreUpperBound(3, 5));
  });

  it('关卡 / 击杀取整与钳制（负数按 0/1 处理）', () => {
    expect(scoreUpperBound(-3, -5)).toBe(scoreUpperBound(1, 0));
  });

  it('0 击杀仍有通关奖励量', () => {
    expect(scoreUpperBound(1, 0)).toBeGreaterThan(0);
  });
});

describe('killsUpperBound', () => {
  it('随关卡单调递增', () => {
    expect(killsUpperBound(5)).toBeGreaterThan(killsUpperBound(1));
  });
});

describe('validatePayload', () => {
  it('合理载荷通过', () => {
    expect(validatePayload(payload()).ok).toBe(true);
  });

  it('拒绝未知榜单模式', () => {
    expect(validatePayload(payload({ mode: 'invalid' as 'single' })).reason).toBe('invalid-mode');
  });

  it('拒绝非有限字段', () => {
    expect(validatePayload(payload({ score: NaN })).ok).toBe(false);
    expect(validatePayload(payload({ stage: Infinity })).ok).toBe(false);
  });

  it('拒绝负数分数 / 击杀', () => {
    expect(validatePayload(payload({ score: -1 })).reason).toBe('negative-field');
    expect(validatePayload(payload({ kills: -1 })).reason).toBe('negative-field');
  });

  it('拒绝关卡小于 1', () => {
    expect(validatePayload(payload({ stage: 0 })).reason).toBe('stage-too-low');
  });

  it('拒绝击杀数超上限', () => {
    const r = validatePayload(payload({ stage: 1, kills: 100000 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kills-too-high');
  });

  it('拒绝分数超上限', () => {
    const r = validatePayload(payload({ stage: 2, kills: 5, score: 99_999_999 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('score-too-high');
  });

  it('边界分数（恰好等于上限）通过', () => {
    const bound = scoreUpperBound(3, 10);
    expect(validatePayload(payload({ stage: 3, kills: 10, score: bound })).ok).toBe(true);
  });
});

describe('fnv1a', () => {
  it('确定性：同输入同输出', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
  });

  it('不同输入不同输出', () => {
    expect(fnv1a('hello')).not.toBe(fnv1a('world'));
  });

  it('固定长度 8 位十六进制', () => {
    expect(fnv1a('')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('a')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('signPayload / verifySignature', () => {
  it('签名可被同盐复算校验', () => {
    const p = payload();
    const sig = signPayload(p);
    expect(verifySignature(p, sig)).toBe(true);
  });

  it('篡改任一字段签名失效', () => {
    const p = payload();
    const sig = signPayload(p);
    expect(verifySignature({ ...p, score: p.score + 1 }, sig)).toBe(false);
    expect(verifySignature({ ...p, kills: p.kills + 1 }, sig)).toBe(false);
    expect(verifySignature({ ...p, name: p.name + 'x' }, sig)).toBe(false);
    expect(verifySignature({ ...p, mode: 'duo' }, sig)).toBe(false);
  });

  it('不同盐得到不同签名', () => {
    const p = payload();
    expect(signPayload(p, 'salt-a')).not.toBe(signPayload(p, 'salt-b'));
  });
});
