// Base 的状态直接绑定在 World 上。这里只保留一个记账类，用于渲染时读 hp。
import type { World } from '../World.ts';
import type { Rect } from '../types.ts';

export class BaseView {
  private world: World;
  constructor(world: World) {
    this.world = world;
  }
  get hp(): number {
    return this.world.baseHp;
  }
  get alive(): boolean {
    return this.world.baseAlive;
  }
  get rect(): Rect {
    return this.world.baseRect();
  }
}
