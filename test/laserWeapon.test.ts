import { describe, expect, it } from 'vitest';
import {
  LASER_MAX_CHARGE_MS,
  laserChargeRatio,
  laserDamage,
  laserRayEnd,
  targetsInLaserPath,
} from '../src/game/LaserWeapon.ts';

describe('focused laser', () => {
  it('clamps charge and scales damage from tap to full charge', () => {
    expect(laserChargeRatio(-10)).toBe(0);
    expect(laserChargeRatio(LASER_MAX_CHARGE_MS / 2)).toBe(0.5);
    expect(laserChargeRatio(LASER_MAX_CHARGE_MS * 2)).toBe(1);
    expect(laserDamage(2, 0)).toBe(2);
    expect(laserDamage(2, 1)).toBe(4);
  });

  it('selects every target crossed by the forward beam in distance order', () => {
    const onPathFar = target(100, 20);
    const behind = target(100, 160);
    const offPath = target(150, 50);
    const onPathNear = target(100, 90);
    const hits = targetsInLaserPath(
      { x: 100, y: 140 },
      'up',
      [onPathFar, behind, offPath, onPathNear],
      6,
    );
    expect(hits).toEqual([onPathNear, onPathFar]);
  });

  it('extends beyond the corresponding world edge', () => {
    expect(laserRayEnd({ x: 10, y: 20 }, 'right', 640, 480)).toEqual({ x: 664, y: 20 });
    expect(laserRayEnd({ x: 10, y: 20 }, 'up', 640, 480)).toEqual({ x: 10, y: -24 });
  });
});

function target(x: number, y: number) {
  return {
    rect: { x: x - 10, y: y - 10, w: 20, h: 20 },
    center: { x, y },
  };
}
