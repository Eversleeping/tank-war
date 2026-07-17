import type { Rect, Vec2 } from '../types.ts';

let nextId = 1;

/** 所有游戏对象的基类。 */
export abstract class Entity {
  id: number;
  rect: Rect;
  alive = true;
  age = 0;

  constructor(rect: Rect) {
    this.id = nextId++;
    this.rect = rect;
  }

  get center(): Vec2 {
    return { x: this.rect.x + this.rect.w / 2, y: this.rect.y + this.rect.h / 2 };
  }

  destroy(): void {
    this.alive = false;
  }
}
