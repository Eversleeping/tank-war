import type { Vec2 } from './types.ts';
import { clamp } from './types.ts';

/**
 * 简单相机。跟随目标点，clamp 在世界边界内。
 */
export class Camera {
  x = 0;
  y = 0;
  viewW: number;
  viewH: number;
  worldW: number;
  worldH: number;

  constructor(viewW: number, viewH: number, worldW: number, worldH: number) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
  }

  resize(viewW: number, viewH: number, worldW: number, worldH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    this.clamp();
  }

  /** 目标在中央安全区内移动时保持镜头稳定，越界后再平滑追随。 */
  follow(target: Vec2, lerp = 0.18): void {
    const safeX = this.viewW * 0.3;
    const safeY = this.viewH * 0.28;
    const left = this.x + safeX;
    const right = this.x + this.viewW - safeX;
    const top = this.y + safeY;
    const bottom = this.y + this.viewH - safeY;
    let tx = this.x;
    let ty = this.y;
    if (target.x < left) tx = target.x - safeX;
    else if (target.x > right) tx = target.x - (this.viewW - safeX);
    if (target.y < top) ty = target.y - safeY;
    else if (target.y > bottom) ty = target.y - (this.viewH - safeY);
    this.x += (tx - this.x) * lerp;
    this.y += (ty - this.y) * lerp;
    this.clamp();
  }

  snap(target: Vec2): void {
    this.x = target.x - this.viewW / 2;
    this.y = target.y - this.viewH / 2;
    this.clamp();
  }

  private clamp(): void {
    if (this.worldW <= this.viewW) {
      this.x = (this.worldW - this.viewW) / 2;
    } else {
      this.x = clamp(this.x, 0, this.worldW - this.viewW);
    }
    if (this.worldH <= this.viewH) {
      this.y = (this.worldH - this.viewH) / 2;
    } else {
      this.y = clamp(this.y, 0, this.worldH - this.viewH);
    }
  }
}
