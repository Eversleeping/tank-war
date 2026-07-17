import type { BulletKind } from './BulletKind.ts';
import type { Dir, Vec2 } from './types.ts';
import { dirAngle } from './types.ts';

type ParticleShape = 'dot' | 'streak' | 'shard' | 'square';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  shape: ParticleShape;
  rotation: number;
  spin: number;
  drag: number;
  gravity: number;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
  dashed: boolean;
}

interface VfxProfile {
  secondary: string;
  muzzleCount: number;
  impactCount: number;
  speed: number;
  spread: number;
  shape: ParticleShape;
  life: number;
  gravity: number;
  shake: number;
  rings: number;
}

const VFX: Record<BulletKind, VfxProfile> = {
  normal: profile('#ffffff', 5, 9, 105, 0.55, 'streak', 0.28, 0, 1, 1),
  rapid: profile('#ccfbf1', 3, 5, 150, 0.18, 'streak', 0.2, 0, 0.6, 0),
  heavy: profile('#fed7aa', 16, 24, 190, 0.9, 'shard', 0.58, 110, 7, 2),
  pierce: profile('#ede9fe', 9, 18, 230, 0.22, 'streak', 0.36, 0, 3, 2),
  explosive: profile('#fbbf24', 18, 42, 240, Math.PI, 'dot', 0.62, 80, 10, 3),
  spread: profile('#fff7ae', 18, 14, 185, 0.82, 'streak', 0.3, 35, 4, 1),
  homing: profile('#cffafe', 8, 16, 130, 1.3, 'dot', 0.5, -15, 3, 2),
  bounce: profile('#f5d0fe', 10, 22, 175, Math.PI, 'square', 0.5, 0, 4, 2),
  freeze: profile('#ffffff', 13, 34, 155, Math.PI, 'shard', 0.72, 34, 5, 3),
  laser: profile('#ffffff', 22, 30, 300, 0.08, 'streak', 0.42, 0, 9, 3),
  plasma: profile('#fef2f2', 14, 38, 125, Math.PI, 'dot', 0.85, -24, 8, 3),
  chain: profile('#dbeafe', 12, 30, 240, Math.PI, 'streak', 0.4, 0, 6, 2),
  shockwave: profile('#ccfbf1', 16, 28, 190, Math.PI, 'shard', 0.56, 70, 10, 4),
  railgun: profile('#ffffff', 26, 36, 330, 0.1, 'streak', 0.5, 0, 13, 4),
};

function profile(
  secondary: string,
  muzzleCount: number,
  impactCount: number,
  speed: number,
  spread: number,
  shape: ParticleShape,
  life: number,
  gravity: number,
  shake: number,
  rings: number,
): VfxProfile {
  return { secondary, muzzleCount, impactCount, speed, spread, shape, life, gravity, shake, rings };
}

export class WeaponVfx {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private shake = 0;
  private phase = 0;

  update(dt: number): void {
    this.phase += dt * 37;
    this.shake = Math.max(0, this.shake - dt * 28);
    for (const p of this.particles) {
      p.life -= dt;
      const damp = Math.pow(p.drag, dt * 60);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const ring of this.rings) {
      ring.life -= dt;
      const t = 1 - Math.max(0, ring.life) / ring.maxLife;
      ring.radius += (ring.targetRadius - ring.radius) * Math.min(1, dt * (8 + t * 8));
    }
    this.rings = this.rings.filter((ring) => ring.life > 0);
  }

  muzzle(pos: Vec2, kind: BulletKind, color: string, angle: number, power = 1): void {
    const fx = VFX[kind];
    const count = Math.max(2, Math.round(fx.muzzleCount * Math.max(0.45, power)));
    for (let i = 0; i < count; i++) {
      const a = angle + randomBetween(-fx.spread, fx.spread);
      const speed = fx.speed * randomBetween(0.45, 1.15) * Math.max(0.7, power);
      this.addParticle(pos, Math.cos(a) * speed, Math.sin(a) * speed, {
        color: i % 3 === 0 ? fx.secondary : color,
        shape: fx.shape,
        size: randomBetween(1.4, kind === 'heavy' || kind === 'railgun' ? 4.5 : 3.2),
        life: fx.life * randomBetween(0.65, 1),
        gravity: fx.gravity,
      });
    }
    this.shake = Math.max(this.shake, fx.shake * Math.max(0.55, power) * 0.1);
  }

  impact(
    pos: Vec2,
    radius: number,
    kind: BulletKind,
    color: string,
    shakeScale = 1,
  ): void {
    const fx = VFX[kind];
    const scale = Math.max(0.7, Math.min(2.2, radius / 28));
    const count = Math.round(fx.impactCount * Math.sqrt(scale));
    for (let i = 0; i < count; i++) {
      const a = randomBetween(0, Math.PI * 2);
      const speed = fx.speed * randomBetween(0.25, 1.05) * scale;
      this.addParticle(pos, Math.cos(a) * speed, Math.sin(a) * speed, {
        color: i % 4 === 0 ? fx.secondary : color,
        shape: fx.shape,
        size: randomBetween(1.5, 4.6) * Math.sqrt(scale),
        life: fx.life * randomBetween(0.7, 1.15),
        gravity: fx.gravity,
      });
    }
    for (let i = 0; i < fx.rings; i++) {
      const delayScale = 1 + i * 0.24;
      this.rings.push({
        x: pos.x,
        y: pos.y,
        radius: Math.max(2, radius * 0.08 * delayScale),
        targetRadius: Math.max(13, radius * (1.05 + i * 0.34)),
        life: 0.28 + i * 0.06,
        maxLife: 0.28 + i * 0.06,
        color: i % 2 === 0 ? color : fx.secondary,
        width: Math.max(1.2, radius * 0.055 - i * 0.3),
        dashed: kind === 'freeze' || kind === 'bounce' || kind === 'railgun',
      });
    }
    this.shake = Math.max(
      this.shake,
      fx.shake * Math.min(1.6, scale) * 0.18 * Math.max(0, shakeScale),
    );
    this.trim();
  }

  laserRelease(from: Vec2, to: Vec2, color: string, power: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const count = Math.min(54, Math.max(20, Math.round(len / 28)));
    for (let i = 0; i < count; i++) {
      const t = randomBetween(0, 1);
      const side = randomBetween(-8, 8) * (0.4 + power);
      const pos = { x: from.x + dx * t + nx * side, y: from.y + dy * t + ny * side };
      const sideSpeed = randomBetween(-170, 170) * (0.5 + power);
      this.addParticle(pos, ux * randomBetween(80, 260) + nx * sideSpeed, uy * randomBetween(80, 260) + ny * sideSpeed, {
        color: i % 3 === 0 ? '#ffffff' : color,
        shape: 'streak',
        size: randomBetween(1.2, 3.4),
        life: randomBetween(0.18, 0.46),
        gravity: 0,
      });
    }
    this.impact(from, 18 + power * 14, 'laser', color, 0);
  }

  shakeOffset(): Vec2 {
    if (this.shake <= 0.05) return { x: 0, y: 0 };
    return {
      x: Math.sin(this.phase * 2.17) * this.shake,
      y: Math.cos(this.phase * 2.83) * this.shake * 0.7,
    };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const ring of this.rings) {
      const alpha = Math.max(0, ring.life / ring.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = ring.color;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = ring.width * alpha;
      if (ring.dashed) ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of this.particles) this.drawParticle(ctx, p);
  }

  drawCharge(
    ctx: CanvasRenderingContext2D,
    charge: { center: Vec2; dir: Dir; ratio: number; color: string },
  ): void {
    const { center, dir, color } = charge;
    const ratio = Math.max(0, Math.min(1, charge.ratio));
    const angle = dirAngle(dir);
    const pulse = 0.5 + Math.sin(this.phase * (0.8 + ratio)) * 0.5;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 + ratio * 22;
    for (let i = 0; i < 3; i++) {
      const radius = 15 + i * 8 - ratio * (8 + i * 3) + pulse * 2;
      ctx.globalAlpha = 0.3 + ratio * 0.25;
      ctx.strokeStyle = i === 1 ? '#ffffff' : color;
      ctx.lineWidth = 1.5 + ratio * 1.5;
      ctx.setLineDash([3 + i * 2, 7 - i]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(4, radius), this.phase * (i % 2 ? -1 : 1), Math.PI * 1.55 + this.phase * (i % 2 ? -1 : 1));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const core = 3 + ratio * 7 + pulse * 1.5;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, core * 2.6);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.28, color);
    glow.addColorStop(1, 'rgba(240,171,252,0)');
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, core * 2.6, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399 + this.phase * (1.4 + ratio);
      const distance = 20 + (i % 3) * 7 - ratio * 13;
      ctx.globalAlpha = 0.35 + ratio * 0.55;
      ctx.fillStyle = i % 3 === 0 ? '#ffffff' : color;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * distance, Math.sin(a) * distance, 1 + ratio * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private addParticle(
    pos: Vec2,
    vx: number,
    vy: number,
    options: { color: string; shape: ParticleShape; size: number; life: number; gravity: number },
  ): void {
    this.particles.push({
      x: pos.x,
      y: pos.y,
      vx,
      vy,
      size: options.size,
      life: options.life,
      maxLife: options.life,
      color: options.color,
      shape: options.shape,
      rotation: randomBetween(0, Math.PI * 2),
      spin: randomBetween(-12, 12),
      drag: randomBetween(0.9, 0.975),
      gravity: options.gravity,
    });
    this.trim();
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    const alpha = Math.max(0, p.life / p.maxLife);
    const speed = Math.hypot(p.vx, p.vy);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.shape === 'streak' && speed > 1 ? Math.atan2(p.vy, p.vx) : p.rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 3;
    const size = p.size * (0.35 + alpha * 0.65);
    if (p.shape === 'streak') {
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillRect(-size * (2.5 + speed / 120), -size * 0.35, size * (3 + speed / 120), size * 0.7);
    } else if (p.shape === 'shard') {
      ctx.beginPath();
      ctx.moveTo(size * 1.8, 0);
      ctx.lineTo(-size, -size * 0.6);
      ctx.lineTo(-size * 0.3, size);
      ctx.closePath();
      ctx.fill();
    } else if (p.shape === 'square') {
      ctx.fillRect(-size, -size, size * 2, size * 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private trim(): void {
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    if (this.rings.length > 80) this.rings.splice(0, this.rings.length - 80);
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
