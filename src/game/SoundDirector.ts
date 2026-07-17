import type { BulletKind } from './BulletKind.ts';
import type { SoundKind } from './Audio.ts';
import type { AudioEngine } from './Audio.ts';

/**
 * 音效导演。把「游戏事件」翻译成「音效种类」并负责节流，
 * 避免同一帧大量同类事件（多敌同时开火、群体命中）产生刺耳叠音。
 *
 * 事件→音效的映射与节流窗口是纯逻辑，可单测；实际发声委托给 AudioEngine。
 */

/** 根据弹种选择开火音效：重型/爆破类用更沉的 fireHeavy。 */
export function fireSoundForBullet(kind: BulletKind): SoundKind {
  switch (kind) {
    case 'heavy':
    case 'explosive':
    case 'plasma':
    case 'shockwave':
    case 'railgun':
      return 'fireHeavy';
    case 'laser':
    case 'chain':
      return 'fireEnergy';
    default:
      return 'fire';
  }
}

/** 每种音效的最小重播间隔（ms）。0 表示不节流。 */
export const THROTTLE_MS: Partial<Record<SoundKind, number>> = {
  fire: 60,
  fireHeavy: 90,
  fireEnergy: 70,
  hit: 50,
  explosion: 70,
  baseHit: 120,
  freeze: 150,
  select: 40,
};

export class SoundDirector {
  private audio: AudioEngine;
  private lastPlayed = new Map<SoundKind, number>();
  /** 可注入的时钟，便于测试；默认用 performance.now / Date.now。 */
  private now: () => number;

  constructor(audio: AudioEngine, now?: () => number) {
    this.audio = audio;
    this.now =
      now ??
      (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  /** 判断某音效此刻是否允许播放（未超节流窗口则拒绝）。 */
  canPlay(kind: SoundKind, at = this.now()): boolean {
    const gap = THROTTLE_MS[kind] ?? 0;
    if (gap <= 0) return true;
    const last = this.lastPlayed.get(kind);
    if (last === undefined) return true;
    return at - last >= gap;
  }

  /** 播放一个音效（带节流）。返回是否真的触发了播放。 */
  play(kind: SoundKind): boolean {
    const at = this.now();
    if (!this.canPlay(kind, at)) return false;
    this.lastPlayed.set(kind, at);
    this.audio.play(kind);
    return true;
  }

  /** 开火事件：按弹种选择音效。 */
  fire(kind: BulletKind): boolean {
    return this.play(fireSoundForBullet(kind));
  }
}
