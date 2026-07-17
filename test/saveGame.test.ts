// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SAVE_VERSION,
  clearRun,
  deserializeRun,
  hasSavedRun,
  loadRun,
  saveRun,
  serializeRun,
  type RunSnapshotInput,
} from '../src/storage/saveGame.ts';

function sampleInput(over: Partial<RunSnapshotInput> = {}): RunSnapshotInput {
  return {
    stage: 3,
    score: 1250,
    kills: 17,
    lives: 2,
    inventoryOrder: ['heavy', 'homing'],
    weaponEnergy: 63,
    bulletLevels: { heavy: 2 },
    currentBullet: 'heavy',
    buffs: { haste: 2, rapidFire: 1, regen: 3 },
    dda: { level: 1, cleanStreak: 0, deathStreak: 0 },
    name: '指挥官',
    ...over,
  };
}

describe('serialize / deserialize 往返', () => {
  it('往返后数据一致，且带上当前版本号', () => {
    const input = sampleInput();
    const snap = deserializeRun(serializeRun(input));
    expect(snap).not.toBeNull();
    expect(snap!.version).toBe(SAVE_VERSION);
    expect(snap!.stage).toBe(3);
    expect(snap!.inventoryOrder).toEqual(['heavy', 'homing']);
    expect(snap!.weaponEnergy).toBe(63);
    expect(snap!.bulletLevels).toEqual({ heavy: 2 });
    expect(snap!.currentBullet).toBe('heavy');
    expect(snap!.buffs).toEqual({ haste: 2, rapidFire: 1, regen: 3 });
    expect(snap!.dda).toEqual({ level: 1, cleanStreak: 0, deathStreak: 0 });
    expect(snap!.name).toBe('指挥官');
  });
});

describe('deserializeRun 校验', () => {
  it('null / 空串返回 null', () => {
    expect(deserializeRun(null)).toBeNull();
    expect(deserializeRun('')).toBeNull();
  });

  it('损坏 JSON 返回 null', () => {
    expect(deserializeRun('{not json')).toBeNull();
  });

  it('版本不符返回 null', () => {
    const raw = JSON.stringify({ ...sampleInput(), version: 999 });
    expect(deserializeRun(raw)).toBeNull();
  });

  it('stage 非法返回 null', () => {
    const raw = serializeRun(sampleInput()).replace('"stage":3', '"stage":0');
    expect(deserializeRun(raw)).toBeNull();
  });

  it('currentBullet 非法弹种返回 null', () => {
    const raw = serializeRun(sampleInput()).replace('"currentBullet":"heavy"', '"currentBullet":"bogus"');
    expect(deserializeRun(raw)).toBeNull();
  });

  it('过滤 inventoryOrder 中的非法弹种、normal 与重复', () => {
    const raw = JSON.stringify({
      ...sampleInput(),
      version: SAVE_VERSION,
      inventoryOrder: ['heavy', 'normal', 'bogus', 'heavy', 'homing'],
    });
    const snap = deserializeRun(raw);
    expect(snap!.inventoryOrder).toEqual(['heavy', 'homing']);
  });

  it('武器能量被钳制到 0-100', () => {
    const raw = JSON.stringify({
      ...sampleInput(),
      version: SAVE_VERSION,
      weaponEnergy: 999,
    });
    const snap = deserializeRun(raw);
    expect(snap!.weaponEnergy).toBe(100);
  });

  it('v1 次数弹药存档会迁移为满能量', () => {
    const { buffs: _buffs, ...oldInput } = sampleInput();
    const raw = JSON.stringify({
      ...oldInput,
      version: 1,
      ammo: { heavy: 2 },
      weaponEnergy: undefined,
    });
    const snap = deserializeRun(raw);
    expect(snap!.version).toBe(SAVE_VERSION);
    expect(snap!.weaponEnergy).toBe(100);
    expect(snap!.inventoryOrder).toContain('heavy');
    expect(snap!.buffs).toEqual({ haste: 0, rapidFire: 0, regen: 0 });
  });

  it('v2 旧档缺少增益时迁移为空增益', () => {
    const { buffs: _buffs, ...oldInput } = sampleInput();
    const snap = deserializeRun(JSON.stringify({ ...oldInput, version: 2 }));
    expect(snap!.buffs).toEqual({ haste: 0, rapidFire: 0, regen: 0 });
  });

  it('增益层数会被钳制到 0-3', () => {
    const raw = JSON.stringify({
      ...sampleInput(),
      version: SAVE_VERSION,
      buffs: { haste: 99, rapidFire: -2, regen: 1.9 },
    });
    expect(deserializeRun(raw)!.buffs).toEqual({ haste: 3, rapidFire: 0, regen: 1 });
  });

  it('缺失 / 损坏 dda 回退为中性态', () => {
    const raw = JSON.stringify({ ...sampleInput(), version: SAVE_VERSION, dda: 'oops' });
    const snap = deserializeRun(raw);
    expect(snap!.dda).toEqual({ level: 0, cleanStreak: 0, deathStreak: 0 });
  });

  it('name 超长被截断到 16', () => {
    const long = 'x'.repeat(50);
    const raw = JSON.stringify({ ...sampleInput(), version: SAVE_VERSION, name: long });
    const snap = deserializeRun(raw);
    expect(snap!.name.length).toBe(16);
  });

  it('score / kills 负数被钳到 0', () => {
    const raw = JSON.stringify({ ...sampleInput(), version: SAVE_VERSION, score: -5, kills: -1 });
    const snap = deserializeRun(raw);
    expect(snap!.score).toBe(0);
    expect(snap!.kills).toBe(0);
  });
});

describe('localStorage 存取', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save 后 load 一致', () => {
    saveRun(sampleInput());
    const snap = loadRun();
    expect(snap!.stage).toBe(3);
    expect(snap!.currentBullet).toBe('heavy');
  });

  it('无存档时 load 返回 null，hasSavedRun 为 false', () => {
    expect(loadRun()).toBeNull();
    expect(hasSavedRun()).toBe(false);
  });

  it('save 后 hasSavedRun 为 true', () => {
    saveRun(sampleInput());
    expect(hasSavedRun()).toBe(true);
  });

  it('clearRun 后不再有存档', () => {
    saveRun(sampleInput());
    clearRun();
    expect(loadRun()).toBeNull();
    expect(hasSavedRun()).toBe(false);
  });

  it('存储中残留损坏数据时 load 安全返回 null', () => {
    localStorage.setItem('tankwar/save/v1', '{broken');
    expect(loadRun()).toBeNull();
  });
});
