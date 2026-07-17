// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SOUND_RECIPES,
  recipeDuration,
  loadMuted,
  saveMuted,
  AudioEngine,
  type SoundKind,
} from '../src/game/Audio.ts';

beforeEach(() => {
  localStorage.clear();
});

describe('SOUND_RECIPES', () => {
  it('每种音效至少有一个音符', () => {
    for (const kind of Object.keys(SOUND_RECIPES) as SoundKind[]) {
      expect(SOUND_RECIPES[kind].tones.length).toBeGreaterThan(0);
    }
  });

  it('所有音符的时长与增益为正、频率有效', () => {
    for (const recipe of Object.values(SOUND_RECIPES)) {
      for (const t of recipe.tones) {
        expect(t.duration).toBeGreaterThan(0);
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(1);
        expect(t.startFreq).toBeGreaterThan(0);
        expect(t.endFreq).toBeGreaterThan(0);
        expect(t.delay).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('recipeDuration', () => {
  it('取所有音符 delay+duration 的最大值', () => {
    expect(
      recipeDuration({
        tones: [
          { wave: 'sine', startFreq: 100, endFreq: 100, delay: 0, duration: 0.1, gain: 0.2 },
          { wave: 'sine', startFreq: 200, endFreq: 200, delay: 0.2, duration: 0.3, gain: 0.2 },
        ],
      }),
    ).toBeCloseTo(0.5, 6);
  });

  it('把噪声层的时长也算进去', () => {
    expect(
      recipeDuration({
        tones: [{ wave: 'sine', startFreq: 100, endFreq: 100, delay: 0, duration: 0.1, gain: 0.2 }],
        noise: { delay: 0.05, duration: 0.4, gain: 0.2 },
      }),
    ).toBeCloseTo(0.45, 6);
  });
});

describe('静音持久化', () => {
  it('save/load 往返一致', () => {
    saveMuted(true);
    expect(loadMuted()).toBe(true);
    saveMuted(false);
    expect(loadMuted()).toBe(false);
  });

  it('未设置时默认非静音', () => {
    localStorage.clear();
    expect(loadMuted()).toBe(false);
  });
});

describe('AudioEngine 安全降级', () => {
  it('无 WebAudio 环境下 play/resume 不抛错', () => {
    // jsdom 默认无 AudioContext
    const engine = new AudioEngine();
    expect(engine.isAvailable).toBe(false);
    expect(() => engine.play('fire')).not.toThrow();
    expect(() => engine.resume()).not.toThrow();
  });

  it('toggleMute 翻转状态并持久化', () => {
    const engine = new AudioEngine();
    const before = engine.isMuted;
    const after = engine.toggleMute();
    expect(after).toBe(!before);
    expect(loadMuted()).toBe(after);
  });

  it('构造时读取已保存的静音状态', () => {
    saveMuted(true);
    const engine = new AudioEngine();
    expect(engine.isMuted).toBe(true);
  });
});
