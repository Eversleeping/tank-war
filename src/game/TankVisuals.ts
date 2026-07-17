import type { BulletKind } from './BulletKind.ts';
import { BULLET_SPECS } from './BulletTypes.ts';
import type { EnemyProfile } from './entities/Enemy.ts';
import type { Dir, Rect } from './types.ts';

export interface TankVisualView {
  rect: Rect;
  dir: Dir;
  age: number;
  moveDist: number;
  profile?: EnemyProfile;
  visualTier?: number;
  renderColor?: string;
  currentBullet?: BulletKind;
  weaponLevel?: number;
}

type Point = readonly [number, number];

const INK = '#070b12';
const STEEL = '#cbd5e1';
const STEEL_DARK = '#475569';

export function drawPlayerTankVisual(
  ctx: CanvasRenderingContext2D,
  tank: TankVisualView,
): void {
  const { x, y, w, h } = tank.rect;
  const body = tank.renderColor ?? '#22c55e';
  const weapon = tank.currentBullet ?? 'normal';
  const spec = BULLET_SPECS[weapon];
  const pulse = 0.7 + Math.sin(tank.age * 7) * 0.18;
  const level = Math.max(1, Math.min(5, Math.floor(tank.weaponLevel ?? 1)));

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotationFor(tank.dir));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawGroundShadow(ctx, w, h);
  drawTracks(ctx, w, h, tank.moveDist, body);

  // A layered glacis, separate fenders and rear deck give the player a readable hero silhouette.
  ctx.fillStyle = '#0b1720';
  fillPolygon(ctx, [[-20, 25], [-23, 10], [-21, -19], [-13, -27], [13, -27], [21, -19], [23, 10], [20, 25]]);
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = body;
  fillPolygon(ctx, [[-17, 22], [-19, 7], [-17, -18], [-10, -24], [10, -24], [17, -18], [19, 7], [17, 22]]);
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(2, 6, 23, 0.28)';
  fillPolygon(ctx, [[-14, 17], [-16, 3], [-11, -17], [0, -22], [11, -17], [16, 3], [14, 17], [0, 12]]);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  fillPolygon(ctx, [[-14, -17], [0, -23], [14, -17], [10, -12], [-10, -12]]);

  drawPlayerWeaponBase(ctx, weapon, spec.color, spec.glow, pulse);

  // Rear-deck weapon-level lamps stay subtle but make upgrades visible on the chassis.
  ctx.fillStyle = '#071018';
  ctx.fillRect(-14, 16, 28, 7);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < level ? spec.color : '#263442';
    ctx.fillRect(-11 + i * 5, 18, 3, 3);
  }
  ctx.fillStyle = '#dbeafe';
  ctx.beginPath();
  ctx.arc(-14, -15, 2, 0, Math.PI * 2);
  ctx.arc(14, -15, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawEnemyTankVisual(
  ctx: CanvasRenderingContext2D,
  tank: TankVisualView,
): void {
  const profile = tank.profile;
  if (!profile) return;

  const { x, y, w, h } = tank.rect;
  const tier = clampTier(tank.visualTier);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotationFor(tank.dir));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawGroundShadow(ctx, w, h);
  drawTracks(ctx, w, h, tank.moveDist, profile.accent);

  switch (profile.kind) {
    case 'scout':
      drawScout(ctx, profile, tier, tank.age);
      break;
    case 'gunner':
      drawGunner(ctx, profile, tier);
      break;
    case 'brute':
      drawBrute(ctx, profile, tier);
      break;
    case 'sniper':
      drawSniper(ctx, profile, tier, tank.age);
      break;
    case 'commander':
      drawCommander(ctx, profile, tier, tank.age);
      break;
    case 'raider':
      drawRaider(ctx, profile, tier, tank.age);
      break;
    case 'demolisher':
      drawDemolisher(ctx, profile, tier);
      break;
    case 'boss':
      drawBoss(ctx, profile, tier, tank.age);
      break;
  }

  drawEnemyTierInsignia(ctx, profile.accent, tier);
  ctx.restore();
}

function drawPlayerWeaponBase(
  ctx: CanvasRenderingContext2D,
  kind: BulletKind,
  color: string,
  glow: string,
  pulse: number,
): void {
  ctx.shadowColor = glow;
  ctx.shadowBlur = kind === 'normal' ? 0 : 6;

  switch (kind) {
    case 'normal':
      drawGunTube(ctx, 0, 5, -35, STEEL, 7);
      break;
    case 'rapid':
      drawGunTube(ctx, -4, 3, -35, color, 5);
      drawGunTube(ctx, 4, 3, -35, color, 5);
      ctx.fillStyle = STEEL_DARK;
      ctx.fillRect(-8, -25, 16, 5);
      break;
    case 'heavy':
      drawGunTube(ctx, 0, 9, -35, color, 10);
      ctx.fillStyle = INK;
      ctx.fillRect(-7, -36, 14, 5);
      ctx.fillStyle = color;
      ctx.fillRect(-8, -34, 3, 3);
      ctx.fillRect(5, -34, 3, 3);
      break;
    case 'pierce':
      drawGunTube(ctx, 0, 3, -38, '#f8fafc', 5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, -15);
      ctx.lineTo(-3, -36);
      ctx.moveTo(5, -15);
      ctx.lineTo(3, -36);
      ctx.stroke();
      break;
    case 'explosive':
      drawGunTube(ctx, 0, 11, -32, color, 11);
      ctx.fillStyle = '#111827';
      ctx.fillRect(-8, -34, 16, 7);
      ctx.fillStyle = '#fda4af';
      ctx.fillRect(-6, -31, 12, 2);
      break;
    case 'spread':
      drawGunTube(ctx, -7, 3, -33, color, 4);
      drawGunTube(ctx, 0, 4, -36, '#fff7ae', 5);
      drawGunTube(ctx, 7, 3, -33, color, 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-1, -17);
      ctx.lineTo(-7, -31);
      ctx.moveTo(1, -17);
      ctx.lineTo(7, -31);
      ctx.stroke();
      break;
    case 'homing':
      ctx.fillStyle = '#142631';
      ctx.fillRect(-13, -29, 10, 18);
      ctx.fillRect(3, -29, 10, 18);
      ctx.fillStyle = color;
      for (const px of [-9, 7]) {
        ctx.beginPath();
        ctx.arc(px, -25, 3, 0, Math.PI * 2);
        ctx.arc(px, -17, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'bounce':
      drawGunTube(ctx, 0, 5, -33, color, 6);
      ctx.fillStyle = '#ede9fe';
      fillPolygon(ctx, [[0, -38], [7, -31], [0, -25], [-7, -31]]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    case 'freeze':
      drawGunTube(ctx, 0, 5, -31, '#dbeafe', 7);
      ctx.fillStyle = color;
      fillPolygon(ctx, [[0, -39], [5, -31], [2, -24], [-2, -24], [-5, -31]]);
      ctx.fillStyle = '#ffffff';
      fillPolygon(ctx, [[0, -36], [2, -31], [0, -28], [-2, -31]]);
      break;
    case 'laser':
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-7, -35, 14, 22);
      ctx.fillStyle = color;
      ctx.fillRect(-3, -38, 6, 24);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-1, -39, 2, 20);
      ctx.globalAlpha = 1;
      break;
    case 'plasma':
      drawGunTube(ctx, 0, 7, -30, '#334155', 9);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (let yy = -29; yy <= -19; yy += 5) {
        ctx.beginPath();
        ctx.ellipse(0, yy, 7, 2.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = pulse;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -34, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'chain':
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-5, -14);
      ctx.lineTo(-8, -31);
      ctx.lineTo(-4, -37);
      ctx.moveTo(5, -14);
      ctx.lineTo(8, -31);
      ctx.lineTo(4, -37);
      ctx.stroke();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4, -30);
      ctx.lineTo(1, -33);
      ctx.lineTo(-1, -27);
      ctx.lineTo(5, -31);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    case 'shockwave':
      drawGunTube(ctx, 0, 6, -27, STEEL_DARK, 8);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, -31, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ccfbf1';
      ctx.beginPath();
      ctx.ellipse(0, -31, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'railgun':
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-9, -37, 5, 25);
      ctx.fillRect(4, -37, 5, 25);
      ctx.fillStyle = color;
      ctx.fillRect(-7, -39, 2, 24);
      ctx.fillRect(5, -39, 2, 24);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(-1, -37, 2, 21);
      ctx.globalAlpha = 1;
      break;
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0b1520';
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -1, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.beginPath();
  ctx.arc(-3, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, -1, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawScout(
  ctx: CanvasRenderingContext2D,
  p: EnemyProfile,
  tier: 1 | 2 | 3,
  age: number,
): void {
  drawGunTube(ctx, 0, tier === 3 ? 4 : 3, tier === 3 ? -37 : -34, STEEL, 5);
  ctx.fillStyle = p.color;
  if (tier === 1) {
    fillPolygon(ctx, [[0, -28], [17, -20], [21, 8], [15, 25], [-15, 25], [-21, 8], [-17, -20]]);
  } else if (tier === 2) {
    fillPolygon(ctx, [[0, -29], [20, -19], [24, 5], [17, 25], [8, 20], [-8, 20], [-17, 25], [-24, 5], [-20, -19]]);
    ctx.fillStyle = p.accent;
    ctx.fillRect(-26, -5, 7, 18);
    ctx.fillRect(19, -5, 7, 18);
  } else {
    fillPolygon(ctx, [[0, -31], [19, -21], [25, -5], [21, 21], [10, 26], [0, 20], [-10, 26], [-21, 21], [-25, -5], [-19, -21]]);
    ctx.fillStyle = p.accent;
    fillPolygon(ctx, [[-28, 0], [-20, -15], [-19, 17], [-27, 11]]);
    fillPolygon(ctx, [[28, 0], [20, -15], [19, 17], [27, 11]]);
    ctx.globalAlpha = 0.55 + Math.sin(age * 10) * 0.25;
    ctx.fillStyle = '#cffafe';
    ctx.fillRect(-3, 18, 6, 7);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = p.accent;
  fillPolygon(ctx, [[0, -17], [11, -5], [0, 9], [-11, -5]]);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, -3, 4 + tier, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ecfeff';
  ctx.beginPath();
  ctx.arc(0, -6, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawGunner(ctx: CanvasRenderingContext2D, p: EnemyProfile, tier: 1 | 2 | 3): void {
  const offsets = tier === 1 ? [-6, 6] : tier === 2 ? [-9, 0, 9] : [-12, -4, 4, 12];
  for (const offset of offsets) drawGunTube(ctx, offset, 3, -35, tier === 3 ? p.accent : STEEL, 4);
  ctx.fillStyle = p.color;
  fillPolygon(ctx, [[-22, -25], [22, -25], [25, -15], [23, 24], [-23, 24], [-25, -15]]);
  ctx.fillStyle = p.accent;
  ctx.fillRect(-17 - tier, -14, 34 + tier * 2, 25);
  ctx.fillStyle = INK;
  ctx.fillRect(-13, -9, 26, 14);
  ctx.fillStyle = p.color;
  ctx.fillRect(-9, -12, 18, 18);
  if (tier >= 2) {
    ctx.fillStyle = '#17212b';
    ctx.fillRect(-24, 10, 8, 11);
    ctx.fillRect(16, 10, 8, 11);
    ctx.fillStyle = p.accent;
    for (const xx of [-21, 19]) {
      ctx.fillRect(xx, 12, 2, 7);
    }
  }
  if (tier === 3) {
    ctx.fillStyle = STEEL;
    fillPolygon(ctx, [[-18, -18], [0, -26], [18, -18], [13, -12], [-13, -12]]);
    ctx.fillStyle = p.accent;
    ctx.fillRect(-15, 16, 30, 4);
  }
}

function drawBrute(ctx: CanvasRenderingContext2D, p: EnemyProfile, tier: 1 | 2 | 3): void {
  const cannonWidth = tier === 1 ? 8 : tier === 2 ? 10 : 12;
  drawGunTube(ctx, 0, cannonWidth, tier === 3 ? -37 : -35, STEEL, cannonWidth);
  if (tier >= 2) {
    ctx.fillStyle = INK;
    ctx.fillRect(-cannonWidth / 2 - 3, -36, cannonWidth + 6, 5);
  }
  ctx.fillStyle = p.color;
  fillPolygon(ctx, [[-26, 23], [-28, -14], [-20, -27], [20, -27], [28, -14], [26, 23], [17, 27], [-17, 27]]);
  ctx.fillStyle = p.accent;
  ctx.fillRect(-21, -20, 42, 9);
  ctx.fillStyle = '#23170f';
  ctx.fillRect(-18, -5, 36, 23);
  ctx.fillStyle = p.color;
  ctx.fillRect(-12, -10, 24, 29);
  if (tier === 1) {
    ctx.fillStyle = p.accent;
    ctx.fillRect(-5, 0, 10, 10);
  } else if (tier === 2) {
    ctx.fillStyle = p.accent;
    ctx.fillRect(-24, -7, 7, 23);
    ctx.fillRect(17, -7, 7, 23);
    ctx.fillStyle = STEEL_DARK;
    ctx.fillRect(-9, -7, 18, 5);
  } else {
    ctx.fillStyle = STEEL_DARK;
    for (const yy of [-7, 4, 15]) {
      for (const xx of [-18, -6, 6]) ctx.fillRect(xx, yy, 10, 8);
    }
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(0, -10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(0, -10, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSniper(
  ctx: CanvasRenderingContext2D,
  p: EnemyProfile,
  tier: 1 | 2 | 3,
  age: number,
): void {
  drawGunTube(ctx, 0, tier === 3 ? 4 : 3, -40, '#f8fafc', 5);
  if (tier >= 2) {
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = tier === 3 ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -14);
    ctx.lineTo(-4, -38);
    ctx.moveTo(6, -14);
    ctx.lineTo(4, -38);
    ctx.stroke();
  }
  ctx.fillStyle = p.color;
  if (tier === 1) {
    fillPolygon(ctx, [[-14, 25], [-19, 8], [-14, -25], [14, -25], [19, 8], [14, 25]]);
  } else if (tier === 2) {
    fillPolygon(ctx, [[-16, 25], [-22, 10], [-17, -24], [-7, -28], [7, -28], [17, -24], [22, 10], [16, 25]]);
  } else {
    fillPolygon(ctx, [[-18, 25], [-23, 11], [-18, -21], [-10, -28], [0, -25], [10, -28], [18, -21], [23, 11], [18, 25], [0, 18]]);
    ctx.fillStyle = p.accent;
    ctx.fillRect(-25, 8, 8, 11);
    ctx.fillRect(17, 8, 8, 11);
  }
  ctx.fillStyle = p.accent;
  fillPolygon(ctx, [[0, -17], [11, -4], [0, 11], [-11, -4]]);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, -4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.62 + Math.sin(age * 6) * 0.25;
  ctx.fillStyle = tier === 3 ? '#ffffff' : p.accent;
  ctx.fillRect(4, -17, 5 + tier, 4);
  ctx.globalAlpha = 1;
}

function drawCommander(
  ctx: CanvasRenderingContext2D,
  p: EnemyProfile,
  tier: 1 | 2 | 3,
  age: number,
): void {
  drawGunTube(ctx, 0, 5 + tier, -35, STEEL, 7);
  ctx.fillStyle = p.color;
  fillPolygon(ctx, [[-23, 19], [-26, -10], [-15, -26], [15, -26], [26, -10], [23, 19], [12, 27], [-12, 27]]);
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.arc(0, -1, 14 + tier, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#25131f';
  fillPolygon(ctx, [[0, -12], [7, -2], [0, 9], [-7, -2]]);
  if (tier === 1) {
    drawAntenna(ctx, 17, 5, 24, -13, p.accent);
  } else if (tier === 2) {
    drawAntenna(ctx, 18, 6, 25, -16, p.accent);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-15, 3, 8, Math.PI * 0.8, Math.PI * 1.9);
    ctx.stroke();
  } else {
    drawAntenna(ctx, -18, 5, -25, -16, p.accent);
    drawAntenna(ctx, 18, 5, 25, -16, p.accent);
    ctx.strokeStyle = '#fdf2f8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -2, 20, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.55 + Math.sin(age * 8) * 0.25;
    ctx.fillStyle = '#fdf2f8';
    ctx.beginPath();
    ctx.arc(0, -20, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawRaider(
  ctx: CanvasRenderingContext2D,
  p: EnemyProfile,
  tier: 1 | 2 | 3,
  age: number,
): void {
  drawGunTube(ctx, 0, 4, -36, STEEL, 5);
  ctx.fillStyle = p.color;
  fillPolygon(ctx, [[0, -30], [21, -12], [17, 23], [0, 16], [-17, 23], [-21, -12]]);
  ctx.fillStyle = p.accent;
  if (tier === 1) {
    fillPolygon(ctx, [[-25, -4], [-17, -14], [-17, 16], [-26, 9]]);
    fillPolygon(ctx, [[25, -4], [17, -14], [17, 16], [26, 9]]);
  } else if (tier === 2) {
    fillPolygon(ctx, [[-29, -11], [-18, -20], [-16, 17], [-28, 22], [-24, 4]]);
    fillPolygon(ctx, [[29, -11], [18, -20], [16, 17], [28, 22], [24, 4]]);
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(-27, -5, 4, 17);
    ctx.fillRect(23, -5, 4, 17);
  } else {
    fillPolygon(ctx, [[-30, -18], [-19, -23], [-16, 1], [-29, 12], [-25, -2]]);
    fillPolygon(ctx, [[-28, 12], [-16, 4], [-17, 23], [-26, 28]]);
    fillPolygon(ctx, [[30, -18], [19, -23], [16, 1], [29, 12], [25, -2]]);
    fillPolygon(ctx, [[28, 12], [16, 4], [17, 23], [26, 28]]);
    ctx.globalAlpha = 0.55 + Math.sin(age * 12) * 0.3;
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(-3, 14, 6, 10);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = INK;
  fillPolygon(ctx, [[0, -15], [11, 0], [0, 13], [-11, 0]]);
  ctx.fillStyle = p.accent;
  fillPolygon(ctx, [[0, -9], [6, 0], [0, 7], [-6, 0]]);
}

function drawDemolisher(ctx: CanvasRenderingContext2D, p: EnemyProfile, tier: 1 | 2 | 3): void {
  drawGunTube(ctx, 0, 10 + tier, tier === 3 ? -36 : -33, STEEL_DARK, 12);
  ctx.fillStyle = INK;
  ctx.fillRect(-9, -35, 18, 7);
  ctx.fillStyle = p.color;
  fillPolygon(ctx, [[-24, -25], [24, -25], [27, -17], [25, 26], [-25, 26], [-27, -17]]);
  ctx.fillStyle = p.accent;
  ctx.fillRect(-19, -19, 38, 13);
  ctx.fillStyle = '#241b0d';
  ctx.fillRect(-16, -3, 32, 22);
  if (tier === 1) {
    ctx.fillStyle = p.accent;
    for (const xx of [-12, -3, 6]) ctx.fillRect(xx, 8, 6, 9);
  } else if (tier === 2) {
    ctx.fillStyle = p.accent;
    ctx.fillRect(-23, -4, 8, 24);
    ctx.fillRect(15, -4, 8, 24);
    ctx.fillStyle = '#fef3c7';
    for (const xx of [-20, 18]) {
      ctx.beginPath();
      ctx.arc(xx, 2, 2, 0, Math.PI * 2);
      ctx.arc(xx, 9, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = STEEL_DARK;
    ctx.fillRect(-22, -10, 44, 10);
    ctx.fillStyle = p.accent;
    for (const xx of [-20, -10, 0, 10]) {
      fillPolygon(ctx, [[xx, 13], [xx + 5, 5], [xx + 10, 5], [xx + 5, 13]]);
    }
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(-12, -7, 24, 3);
  }
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  p: EnemyProfile,
  tier: 1 | 2 | 3,
  age: number,
): void {
  drawGunTube(ctx, 0, 9 + tier, tier === 3 ? -39 : -36, STEEL, 11);
  if (tier >= 2) {
    drawGunTube(ctx, -18, 4, -32, p.accent, 5);
    drawGunTube(ctx, 18, 4, -32, p.accent, 5);
  }
  if (tier === 3) {
    drawGunTube(ctx, -10, 4, -36, '#fef2f2', 5);
    drawGunTube(ctx, 10, 4, -36, '#fef2f2', 5);
  }
  ctx.fillStyle = p.color;
  fillPolygon(ctx, [[-26, 19], [-29, -14], [-17, -28], [17, -28], [29, -14], [26, 19], [16, 28], [-16, 28]]);
  ctx.fillStyle = p.accent;
  ctx.fillRect(-28, -11, 12, 24);
  ctx.fillRect(16, -11, 12, 24);
  ctx.fillStyle = '#3b0a0a';
  ctx.beginPath();
  ctx.arc(0, 0, 16 + tier, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = p.accent;
  ctx.fillRect(-3, -12, 6, 24);
  ctx.fillRect(-12, -3, 24, 6);
  if (tier >= 2) {
    ctx.fillStyle = STEEL_DARK;
    ctx.fillRect(-25, 15, 11, 8);
    ctx.fillRect(14, 15, 11, 8);
  }
  if (tier === 3) {
    ctx.globalAlpha = 0.58 + Math.sin(age * 8) * 0.25;
    ctx.strokeStyle = '#fee2e2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff1f2';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGroundShadow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(2, 4, w * 0.46, h * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTracks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  moveDist: number,
  accent: string,
): void {
  const hw = w / 2;
  const hh = h / 2;
  const phase = (moveDist / 3) % 8;
  for (const side of [-1, 1]) {
    const left = side < 0 ? -hw + 1 : hw - 10;
    ctx.fillStyle = '#05080d';
    ctx.fillRect(left, -hh + 3, 9, h - 6);
    ctx.strokeStyle = '#354151';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left + 0.5, -hh + 3.5, 8, h - 7);
    ctx.fillStyle = '#111827';
    for (let yy = -hh + phase; yy < hh; yy += 8) ctx.fillRect(left, yy, 9, 2.5);
    for (const wheelY of [-18, 0, 18]) {
      ctx.fillStyle = '#263241';
      ctx.beginPath();
      ctx.arc(left + 4.5, wheelY, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(left + 4.5, wheelY, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawGunTube(
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  top: number,
  color: string,
  muzzleWidth: number,
): void {
  ctx.fillStyle = INK;
  ctx.fillRect(x - width / 2 - 1.5, top, width + 3, -12 - top);
  ctx.fillStyle = color;
  ctx.fillRect(x - width / 2, top, width, -12 - top);
  ctx.fillStyle = INK;
  ctx.fillRect(x - muzzleWidth / 2, top - 1, muzzleWidth, 4);
}

function drawAntenna(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.fillStyle = '#fff1f2';
  ctx.beginPath();
  ctx.arc(toX, toY, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemyTierInsignia(
  ctx: CanvasRenderingContext2D,
  color: string,
  tier: 1 | 2 | 3,
): void {
  ctx.fillStyle = '#060a10';
  ctx.fillRect(-10, 20, 20, 6);
  ctx.fillStyle = color;
  for (let i = 0; i < tier; i++) {
    const x = -7 + i * 6;
    fillPolygon(ctx, [[x, 24], [x + 2, 21], [x + 4, 24], [x + 4, 26], [x + 2, 23], [x, 26]]);
  }
}

function fillPolygon(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function clampTier(value: number | undefined): 1 | 2 | 3 {
  if (value !== undefined && value >= 3) return 3;
  if (value !== undefined && value >= 2) return 2;
  return 1;
}

function rotationFor(dir: Dir): number {
  if (dir === 'right') return Math.PI / 2;
  if (dir === 'down') return Math.PI;
  if (dir === 'left') return -Math.PI / 2;
  return 0;
}
