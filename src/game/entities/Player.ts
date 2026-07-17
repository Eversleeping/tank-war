import type { BulletKind } from '../BulletKind.ts';
import type { BulletSpec } from '../BulletTypes.ts';
import { BULLET_SPECS } from '../BulletTypes.ts';
import { applyBulletLevel, clampLevel, nextLevel } from '../BulletLevels.ts';
import { PLAYER_MAX_HP, PLAYER_SPEED } from '../constants.ts';
import { Tank } from './Tank.ts';

/** 玩家坦克。 */
export class Player extends Tank {
  score = 0;
  kills = 0;
  lives: number;
  weaponEnergy = 100;
  readonly maxWeaponEnergy = 100;
  readonly weaponEnergyRegen = 18;
  /** 弹种等级：重复拾取同弹种可升级。未记录则视为 1 级。 */
  bulletLevels: Partial<Record<BulletKind, number>> = {};

  constructor(x: number, y: number, lives = 3) {
    super('player', x, y, PLAYER_MAX_HP, PLAYER_SPEED);
    this.lives = lives;
    this.currentBullet = 'normal';
  }

  /** 当前弹种等级（默认 1）。 */
  levelOf(kind: BulletKind): number {
    return clampLevel(this.bulletLevels[kind] ?? 1);
  }

  /** 当前炮台等级，供渲染层显示对应数量的武器状态灯。 */
  get weaponLevel(): number {
    return this.levelOf(this.currentBullet);
  }

  /** 提升某弹种等级；返回升级后的等级（已达上限则维持）。 */
  upgradeBullet(kind: BulletKind): number {
    const lv = nextLevel(this.levelOf(kind));
    this.bulletLevels[kind] = lv;
    return lv;
  }

  /** 当前弹种规格，已按等级放大。 */
  override spec(): BulletSpec {
    return applyBulletLevel(BULLET_SPECS[this.currentBullet], this.levelOf(this.currentBullet));
  }

  /** 解锁校验由 Game 的武器槽负责；Player 只负责切换当前武器。 */
  selectBullet(kind: BulletKind): boolean {
    this.currentBullet = kind;
    return true;
  }

  canSpendEnergy(cost: number): boolean {
    return cost <= 0 || this.weaponEnergy + 1e-6 >= cost;
  }

  spendEnergy(cost: number): boolean {
    if (!this.canSpendEnergy(cost)) return false;
    this.weaponEnergy = Math.max(0, this.weaponEnergy - Math.max(0, cost));
    return true;
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    this.weaponEnergy = Math.min(
      this.maxWeaponEnergy,
      this.weaponEnergy + this.weaponEnergyRegen * dt,
    );
  }

  respawn(x: number, y: number): void {
    this.rect.x = x;
    this.rect.y = y;
    this.hp = this.maxHp;
    this.alive = true;
    this.dir = 'up';
    this.invulnMs = 2000;
    this.freezeMs = 0;
    this.burnMs = 0;
    this.cooldownMs = 0;
    this.weaponEnergy = Math.max(this.weaponEnergy, this.maxWeaponEnergy * 0.5);
  }

  protected onKilled(_attacker: import('./Tank.ts').Tank): void {
    this.destroy();
    this.lives -= 1;
  }
}
