import type { Dir } from './types.ts';

/**
 * 全局输入管理。追踪：
 *   - 键盘：方向键 / WASD / 空格 / 数字键 / Q E / Esc
 *   - 鼠标：左键开火，滚轮切换弹种
 * 每帧 Game.update 调用 consumePressed / consumeWheelSteps 消费瞬时事件。
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private queuedDirs: Dir[] = []; // 记录按键顺序，用于坦克大战的"最近方向优先"
  private mouseFire = false;
  private wheelSteps: number[] = [];
  private lastWheelTs = 0;

  constructor(target: EventTarget = window, canvas?: HTMLElement) {
    target.addEventListener('keydown', (e) => this.onKey(e as KeyboardEvent, true));
    target.addEventListener('keyup', (e) => this.onKey(e as KeyboardEvent, false));
    // 焦点丢失时清空按键
    window.addEventListener('blur', () => this.reset());

    if (canvas) {
      // 左键 = 开火（按住持续），右键屏蔽菜单
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.mouseFire = true;
          e.preventDefault();
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouseFire = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // 滚轮 = 切换弹种。带 60ms 去抖，避免触控板惯性滚动一次翻多格
      canvas.addEventListener(
        'wheel',
        (e) => {
          const dy = (e as WheelEvent).deltaY;
          if (dy === 0) return;
          const now = performance.now();
          if (now - this.lastWheelTs > 60) {
            this.wheelSteps.push(dy > 0 ? 1 : -1);
            this.lastWheelTs = now;
          }
          e.preventDefault();
        },
        { passive: false },
      );
    }
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    const code = e.code;
    if (isEditableTarget(e.target)) return;
    const gameKeys = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'Space',
      'KeyQ',
      'KeyE',
      'Escape',
      'Enter',
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Digit5',
      'Digit6',
      'Digit7',
      'Digit8',
      'Digit9',
    ]);
    if (!gameKeys.has(code)) return;
    e.preventDefault();

    if (isDown) {
      if (!this.down.has(code)) {
        this.pressed.add(code);
        const dir = codeToDir(code);
        if (dir) this.queuedDirs.push(dir);
      }
      this.down.add(code);
    } else {
      this.down.delete(code);
      const dir = codeToDir(code);
      if (dir) this.queuedDirs = this.queuedDirs.filter((d) => d !== dir);
    }
  }

  /** 当前应该走的方向。最近按下但未松开的方向优先，避免同时按两个键抖动。 */
  currentDir(): Dir | null {
    for (let i = this.queuedDirs.length - 1; i >= 0; i--) {
      const d = this.queuedDirs[i];
      if (isDirDown(this.down, d)) return d;
    }
    return null;
  }

  /** 是否持续开火。空格键或鼠标左键任一按下即为 true。 */
  isFiring(): boolean {
    return this.down.has('Space') || this.mouseFire;
  }

  /** 本帧内新按下的键（消费型）。 */
  consumePressed(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /**
   * 消费本帧累积的滚轮步数。
   * 正数 = 向下滚动（下一格弹种），负数 = 向上滚动（上一格弹种）。
   */
  consumeWheelSteps(): number {
    if (this.wheelSteps.length === 0) return 0;
    let sum = 0;
    for (const s of this.wheelSteps) sum += s;
    this.wheelSteps.length = 0;
    return sum;
  }

  /** 结束一帧，清空未消费的 pressed。 */
  endFrame(): void {
    this.pressed.clear();
  }

  /** 强制清空所有输入状态，例如从暂停/弹窗返回游戏时。 */
  reset(): void {
    this.down.clear();
    this.pressed.clear();
    this.queuedDirs = [];
    this.mouseFire = false;
    this.wheelSteps.length = 0;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target.isContentEditable;
}

function codeToDir(code: string): Dir | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
  }
  return null;
}

function isDirDown(down: Set<string>, d: Dir): boolean {
  switch (d) {
    case 'up':
      return down.has('ArrowUp') || down.has('KeyW');
    case 'down':
      return down.has('ArrowDown') || down.has('KeyS');
    case 'left':
      return down.has('ArrowLeft') || down.has('KeyA');
    case 'right':
      return down.has('ArrowRight') || down.has('KeyD');
  }
}
