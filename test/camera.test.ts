import { describe, expect, it } from 'vitest';
import { Camera } from '../src/game/Camera.ts';

describe('Camera', () => {
  it('keeps the view still while the target remains in the safe zone', () => {
    const camera = new Camera(800, 600, 2000, 1600);
    camera.snap({ x: 400, y: 300 });
    camera.follow({ x: 500, y: 360 }, 1);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
  });

  it('tracks outside the safe zone and clamps at world edges', () => {
    const camera = new Camera(800, 600, 2000, 1600);
    camera.snap({ x: 400, y: 300 });
    camera.follow({ x: 700, y: 500 }, 1);
    expect(camera.x).toBe(140);
    expect(camera.y).toBe(68);
    camera.snap({ x: 5000, y: 5000 });
    expect(camera.x).toBe(1200);
    expect(camera.y).toBe(1000);
  });

  it('centers worlds smaller than the viewport', () => {
    const camera = new Camera(1000, 800, 600, 400);
    camera.snap({ x: 300, y: 200 });
    expect(camera.x).toBe(-200);
    expect(camera.y).toBe(-200);
  });
});
