// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SoundDirector,
  fireSoundForBullet,
  THROTTLE_MS,
} from '../src/game/SoundDirector.ts';
import { AudioEngine } from '../src/game/Audio.ts';

beforeEach(() => {
  localStorage.clear();
});

describe('fireSoundForBullet', () => {
  it('重炮/爆破用 fireHeavy', () => {
    expect(fireSoundForBullet('heavy')).toBe('fireHeavy');
    expect(fireSoundForBullet('explosive')).toBe('fireHeavy');
    expect(fireSoundForBullet('railgun')).toBe('fireHeavy');
  });

  it('能量武器使用高频合成音效', () => {
    expect(fireSoundForBullet('laser')).toBe('fireEnergy');
    expect(fireSoundForBullet('chain')).toBe('fireEnergy');
  });

  it('其它弹种用 fire', () => {
    expect(fireSoundForBullet('normal')).toBe('fire');
    expect(fireSoundForBullet('rapid')).toBe('fire');
    expect(fireSoundForBullet('homing')).toBe('fire');
  });
});

/** 可控时钟 */
function makeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('SoundDirector 节流', () => {
  it('同一音效在节流窗口内只播一次', () => {
    const clock = makeClock();
    const director = new SoundDirector(new AudioEngine(), clock.now);
    expect(director.play('fire')).toBe(true);
    // fire 节流 60ms，未到间隔
    clock.advance(30);
    expect(director.play('fire')).toBe(false);
    // 超过间隔后可再播
    clock.advance(40);
    expect(director.play('fire')).toBe(true);
  });

  it('不同音效互不影响节流', () => {
    const clock = makeClock();
    const director = new SoundDirector(new AudioEngine(), clock.now);
    expect(director.play('fire')).toBe(true);
    expect(director.play('explosion')).toBe(true);
    expect(director.play('hit')).toBe(true);
  });

  it('无节流配置的音效每次都可播', () => {
    const clock = makeClock();
    const director = new SoundDirector(new AudioEngine(), clock.now);
    // stageClear 未在 THROTTLE_MS 中，间隔视为 0
    expect(THROTTLE_MS.stageClear).toBeUndefined();
    expect(director.play('stageClear')).toBe(true);
    expect(director.play('stageClear')).toBe(true);
  });

  it('canPlay 与 play 一致', () => {
    const clock = makeClock();
    const director = new SoundDirector(new AudioEngine(), clock.now);
    expect(director.canPlay('baseHit')).toBe(true);
    director.play('baseHit');
    expect(director.canPlay('baseHit')).toBe(false);
    clock.advance(THROTTLE_MS.baseHit! + 1);
    expect(director.canPlay('baseHit')).toBe(true);
  });

  it('fire(kind) 走弹种映射', () => {
    const clock = makeClock();
    const director = new SoundDirector(new AudioEngine(), clock.now);
    expect(director.fire('heavy')).toBe(true); // fireHeavy
    // fire 与 fireHeavy 是不同音效，各自独立节流
    expect(director.fire('normal')).toBe(true); // fire
  });
});
