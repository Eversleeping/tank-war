import type { Rect } from '../types.ts';
import { TILE } from '../constants.ts';
import { Entity } from './Entity.ts';

export type PowerUpKind =
  | 'star'
  | 'shield'
  | 'life'
  | 'bomb'
  | 'freezeAll'
  | 'speed'
  | 'rapid'
  | 'regen';

const SIZE = TILE * 1.4;

/** 场上道具，被玩家拾取产生效果。 */
export class PowerUp extends Entity {
  kind: PowerUpKind;
  lifeMs: number;

  constructor(kind: PowerUpKind, x: number, y: number) {
    const rect: Rect = { x: x - SIZE / 2, y: y - SIZE / 2, w: SIZE, h: SIZE };
    super(rect);
    this.kind = kind;
    this.lifeMs = 12000;
  }

  update(dt: number): void {
    this.age += dt;
    this.lifeMs -= dt * 1000;
    if (this.lifeMs <= 0) this.destroy();
  }
}
