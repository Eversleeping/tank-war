/**
 * 音效系统。用 WebAudio 实时合成音效，不依赖任何素材文件。
 *
 * 设计要点：
 * - 音效"配方"（SOUND_RECIPES）是纯数据，可单测。
 * - 实际发声通过 AudioContext 懒初始化；在无 WebAudio 的环境（如测试）
 *   下自动降级为静默，绝不抛错。
 * - 静音状态持久化到 localStorage。
 */

export type SoundKind =
  | 'fire'
  | 'fireHeavy'
  | 'fireEnergy'
  | 'hit'
  | 'explosion'
  | 'pickup'
  | 'stageClear'
  | 'baseHit'
  | 'gameOver'
  | 'select'
  | 'freeze';

export type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** 单个振荡器音符：从 startFreq 滑到 endFreq，带音量包络。 */
export interface ToneSpec {
  wave: WaveType;
  startFreq: number;
  endFreq: number;
  /** 相对本音效起点的延迟（秒） */
  delay: number;
  /** 持续时长（秒） */
  duration: number;
  /** 峰值音量 0-1 */
  gain: number;
}

export interface SoundRecipe {
  tones: ToneSpec[];
  /** 是否叠加一层噪声（用于爆炸等） */
  noise?: { delay: number; duration: number; gain: number };
}

const MUTE_KEY = 'tankwar/muted/v1';

/** 每种音效的合成配方。频率单位 Hz，时间单位秒。 */
export const SOUND_RECIPES: Record<SoundKind, SoundRecipe> = {
  fire: {
    tones: [{ wave: 'square', startFreq: 660, endFreq: 220, delay: 0, duration: 0.12, gain: 0.18 }],
  },
  fireHeavy: {
    tones: [{ wave: 'sawtooth', startFreq: 320, endFreq: 90, delay: 0, duration: 0.22, gain: 0.26 }],
    noise: { delay: 0, duration: 0.1, gain: 0.12 },
  },
  fireEnergy: {
    tones: [
      { wave: 'sine', startFreq: 980, endFreq: 240, delay: 0, duration: 0.16, gain: 0.2 },
      { wave: 'square', startFreq: 160, endFreq: 520, delay: 0.02, duration: 0.1, gain: 0.1 },
    ],
  },
  hit: {
    tones: [{ wave: 'square', startFreq: 440, endFreq: 180, delay: 0, duration: 0.08, gain: 0.16 }],
  },
  explosion: {
    tones: [{ wave: 'sawtooth', startFreq: 180, endFreq: 40, delay: 0, duration: 0.4, gain: 0.3 }],
    noise: { delay: 0, duration: 0.35, gain: 0.25 },
  },
  pickup: {
    tones: [
      { wave: 'sine', startFreq: 520, endFreq: 520, delay: 0, duration: 0.08, gain: 0.2 },
      { wave: 'sine', startFreq: 780, endFreq: 780, delay: 0.08, duration: 0.12, gain: 0.2 },
    ],
  },
  stageClear: {
    tones: [
      { wave: 'triangle', startFreq: 523, endFreq: 523, delay: 0, duration: 0.14, gain: 0.22 },
      { wave: 'triangle', startFreq: 659, endFreq: 659, delay: 0.14, duration: 0.14, gain: 0.22 },
      { wave: 'triangle', startFreq: 784, endFreq: 784, delay: 0.28, duration: 0.14, gain: 0.22 },
      { wave: 'triangle', startFreq: 1046, endFreq: 1046, delay: 0.42, duration: 0.22, gain: 0.24 },
    ],
  },
  baseHit: {
    tones: [{ wave: 'square', startFreq: 200, endFreq: 60, delay: 0, duration: 0.25, gain: 0.28 }],
    noise: { delay: 0, duration: 0.12, gain: 0.15 },
  },
  gameOver: {
    tones: [
      { wave: 'sawtooth', startFreq: 440, endFreq: 440, delay: 0, duration: 0.2, gain: 0.24 },
      { wave: 'sawtooth', startFreq: 349, endFreq: 349, delay: 0.2, duration: 0.2, gain: 0.24 },
      { wave: 'sawtooth', startFreq: 261, endFreq: 130, delay: 0.4, duration: 0.5, gain: 0.26 },
    ],
  },
  select: {
    tones: [{ wave: 'sine', startFreq: 880, endFreq: 880, delay: 0, duration: 0.05, gain: 0.14 }],
  },
  freeze: {
    tones: [{ wave: 'sine', startFreq: 1200, endFreq: 300, delay: 0, duration: 0.3, gain: 0.18 }],
  },
};

/** 计算一个配方的总时长（秒），用于测试与调度。 */
export function recipeDuration(recipe: SoundRecipe): number {
  let end = 0;
  for (const t of recipe.tones) end = Math.max(end, t.delay + t.duration);
  if (recipe.noise) end = Math.max(end, recipe.noise.delay + recipe.noise.duration);
  return end;
}

type AudioContextCtor = new () => AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * 音频引擎。负责 AudioContext 生命周期与音效播放。
 * 无 WebAudio 时所有播放调用安全降级为空操作。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private masterVolume = 0.6;
  private available: boolean;

  constructor() {
    this.available = getAudioContextCtor() !== null;
    this.muted = loadMuted();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isAvailable(): boolean {
    return this.available;
  }

  /** 需在一次用户手势后调用（浏览器自动播放策略）。可安全重复调用。 */
  resume(): void {
    if (!this.available) return;
    try {
      if (!this.ctx) {
        const Ctor = getAudioContextCtor();
        if (!Ctor) {
          this.available = false;
          return;
        }
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.masterVolume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.available = false;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted);
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(muted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** 播放一个音效。静音、未初始化或不可用时静默返回。 */
  play(kind: SoundKind): void {
    if (this.muted || !this.available) return;
    const recipe = SOUND_RECIPES[kind];
    if (!recipe) return;
    this.resume();
    if (!this.ctx || !this.master) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    try {
      for (const tone of recipe.tones) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = tone.wave;
        const t0 = now + tone.delay;
        const t1 = t0 + tone.duration;
        osc.frequency.setValueAtTime(tone.startFreq, t0);
        if (tone.endFreq !== tone.startFreq) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.endFreq), t1);
        }
        // 音量包络：快速起音，指数衰减
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(tone.gain, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t1);
        osc.connect(g);
        g.connect(this.master);
        osc.start(t0);
        osc.stop(t1 + 0.02);
      }
      if (recipe.noise) {
        this.playNoise(recipe.noise, now);
      }
    } catch {
      // 播放失败不影响游戏
    }
  }

  private playNoise(noise: { delay: number; duration: number; gain: number }, now: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * noise.duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const t0 = now + noise.delay;
    const t1 = t0 + noise.duration;
    g.gain.setValueAtTime(noise.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    src.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t1 + 0.02);
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // 静默失败
  }
}
