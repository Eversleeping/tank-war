import { describe, it, expect } from 'vitest';
import { Player } from '../src/game/entities/Player.ts';
import { BULLET_SPECS } from '../src/game/BulletTypes.ts';
import { MAX_BULLET_LEVEL, applyBulletLevel } from '../src/game/BulletLevels.ts';

describe('Player 弹种等级', () => {
  it('未拾取时任意弹种等级为 1', () => {
    const p = new Player(0, 0);
    expect(p.levelOf('heavy')).toBe(1);
    expect(p.levelOf('normal')).toBe(1);
  });

  it('重复拾取升级并封顶', () => {
    const p = new Player(0, 0);
    expect(p.upgradeBullet('heavy')).toBe(2);
    expect(p.upgradeBullet('heavy')).toBe(3);
    expect(p.levelOf('heavy')).toBe(3);
    // 升到上限后维持
    while (p.levelOf('heavy') < MAX_BULLET_LEVEL) p.upgradeBullet('heavy');
    expect(p.upgradeBullet('heavy')).toBe(MAX_BULLET_LEVEL);
  });

  it('不同弹种等级互相独立', () => {
    const p = new Player(0, 0);
    p.upgradeBullet('heavy');
    expect(p.levelOf('heavy')).toBe(2);
    expect(p.levelOf('pierce')).toBe(1);
  });

  it('spec() 反映当前弹种的等级放大', () => {
    const p = new Player(0, 0);
    p.selectBullet('heavy');
    p.upgradeBullet('heavy'); // Lv2
    const expected = applyBulletLevel(BULLET_SPECS.heavy, 2);
    expect(p.spec().damage).toBe(expected.damage);
    expect(p.spec().cooldown).toBe(expected.cooldown);
    expect(p.weaponLevel).toBe(2);
  });

  it('特殊武器消耗共享能量并自动恢复', () => {
    const p = new Player(0, 0);
    const cost = BULLET_SPECS.heavy.energyCost;
    expect(p.spendEnergy(cost)).toBe(true);
    expect(p.weaponEnergy).toBe(100 - cost);
    p.update(1);
    expect(p.weaponEnergy).toBe(Math.min(100, 100 - cost + p.weaponEnergyRegen));
  });

  it('能量不足时拒绝消耗但不会丢失武器', () => {
    const p = new Player(0, 0);
    p.selectBullet('railgun');
    p.weaponEnergy = 0;
    expect(p.spendEnergy(BULLET_SPECS.railgun.energyCost)).toBe(false);
    expect(p.currentBullet).toBe('railgun');
  });

  it('普通弹在切换时用其自身等级', () => {
    const p = new Player(0, 0);
    p.selectBullet('normal');
    expect(p.spec().damage).toBe(BULLET_SPECS.normal.damage);
  });
});
