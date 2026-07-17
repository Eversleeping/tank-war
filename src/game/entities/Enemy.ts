import type { BulletKind } from '../BulletKind.ts';
import type { BulletSpec } from '../BulletTypes.ts';
import { BULLET_SPECS } from '../BulletTypes.ts';
import { applyBulletLevel } from '../BulletLevels.ts';
import { Tank } from './Tank.ts';

export type EnemyKind =
  | 'scout'
  | 'gunner'
  | 'brute'
  | 'sniper'
  | 'commander'
  | 'raider'
  | 'demolisher'
  | 'boss';

export type EnemyTargetBias = 'player' | 'base' | 'adaptive';

export interface EnemyProfile {
  kind: EnemyKind;
  name: string;
  color: string;
  accent: string;
  bullet: BulletKind;
  hpBonus: number;
  speedMul: number;
  fireCdMul: number;
  scoreMul: number;
  dropChanceBoost: number;
  targetBias: EnemyTargetBias;
  turnMul: number;
  aimTolerance: number;
  evasion: number;
  armor: number;
}

export const ENEMY_PROFILES: Record<EnemyKind, EnemyProfile> = {
  scout: {
    kind: 'scout',
    name: '游骑侦察车',
    color: '#8ba6b8',
    accent: '#67e8f9',
    bullet: 'normal',
    hpBonus: 0,
    speedMul: 1.35,
    fireCdMul: 1.2,
    scoreMul: 1,
    dropChanceBoost: 0,
    targetBias: 'player',
    turnMul: 0.7,
    aimTolerance: 1.1,
    evasion: 1,
    armor: 0,
  },
  gunner: {
    kind: 'gunner',
    name: '双联压制车',
    color: '#5f7c78',
    accent: '#5eead4',
    bullet: 'rapid',
    hpBonus: 1,
    speedMul: 1.0,
    fireCdMul: 0.7,
    scoreMul: 1.2,
    dropChanceBoost: 0.05,
    targetBias: 'player',
    turnMul: 0.9,
    aimTolerance: 1.45,
    evasion: 0,
    armor: 0,
  },
  brute: {
    kind: 'brute',
    name: '堡垒重装车',
    color: '#854d2d',
    accent: '#fdba74',
    bullet: 'heavy',
    hpBonus: 3,
    speedMul: 0.7,
    fireCdMul: 1.3,
    scoreMul: 1.6,
    dropChanceBoost: 0.15,
    targetBias: 'base',
    turnMul: 1.25,
    aimTolerance: 1.05,
    evasion: 0,
    armor: 1,
  },
  sniper: {
    kind: 'sniper',
    name: '长枪狙击车',
    color: '#4b5568',
    accent: '#c4b5fd',
    bullet: 'pierce',
    hpBonus: 1,
    speedMul: 0.9,
    fireCdMul: 1.1,
    scoreMul: 1.8,
    dropChanceBoost: 0.2,
    targetBias: 'player',
    turnMul: 1.1,
    aimTolerance: 0.62,
    evasion: 0,
    armor: 0,
  },
  commander: {
    kind: 'commander',
    name: '猎手指挥车',
    color: '#7c3f58',
    accent: '#f9a8d4',
    bullet: 'homing',
    hpBonus: 4,
    speedMul: 1.0,
    fireCdMul: 1.4,
    scoreMul: 2.5,
    dropChanceBoost: 0.35,
    targetBias: 'player',
    turnMul: 0.75,
    aimTolerance: 1.25,
    evasion: 1,
    armor: 0,
  },
  raider: {
    kind: 'raider',
    name: '侧袭弹跳车',
    color: '#365b7a',
    accent: '#93c5fd',
    bullet: 'bounce',
    hpBonus: 1,
    speedMul: 1.2,
    fireCdMul: 0.85,
    scoreMul: 1.7,
    dropChanceBoost: 0.16,
    targetBias: 'player',
    turnMul: 0.6,
    aimTolerance: 1.0,
    evasion: 2,
    armor: 0,
  },
  demolisher: {
    kind: 'demolisher',
    name: '攻城爆破车',
    color: '#8a5423',
    accent: '#fbbf24',
    bullet: 'explosive',
    hpBonus: 2,
    speedMul: 0.82,
    fireCdMul: 1.15,
    scoreMul: 2.1,
    dropChanceBoost: 0.25,
    targetBias: 'base',
    turnMul: 1.15,
    aimTolerance: 1.35,
    evasion: 0,
    armor: 0,
  },
  boss: {
    kind: 'boss',
    name: '多炮塔战争堡垒',
    color: '#b91c1c',
    accent: '#fca5a5',
    bullet: 'heavy',
    hpBonus: 0, // Boss 血量由 bossHp() 直接指定，不走 baseHp+bonus
    speedMul: 0.55,
    fireCdMul: 1.0,
    scoreMul: 6,
    dropChanceBoost: 1, // 必掉
    targetBias: 'player',
    turnMul: 1.2,
    aimTolerance: 1.5,
    evasion: 0,
    armor: 1,
  },
};

/** 敌人坦克。行为交给 EnemyAI 驱动。 */
export class Enemy extends Tank {
  profile: EnemyProfile;
  fireCdMul: number;
  scoreMul: number;
  dropChanceBoost: number;
  visualTier: 1 | 2 | 3;
  armor: number;
  // 供 AI 使用的临时状态
  aiPathCooldown = 0;
  aiFireCooldownMs = 0;
  aiTurnCooldownMs = 0;
  aiState: 'wander' | 'hunt' | 'siege' | 'ambush' = 'wander';
  // 连续移动失败计数，用于卡死兜底（见 stuck.ts）
  aiStuckCount = 0;
  // Boss 齐射冷却（毫秒）。仅 Boss 使用。
  barrageCooldownMs = 0;

  constructor(
    kind: EnemyKind,
    x: number,
    y: number,
    baseHp: number,
    baseSpeed: number,
    visualTier: 1 | 2 | 3 = 1,
  ) {
    const p = ENEMY_PROFILES[kind];
    const rankStep = visualTier - 1;
    super('enemy', x, y, baseHp + p.hpBonus + rankStep, baseSpeed * p.speedMul * (1 + rankStep * 0.05));
    this.profile = p;
    this.visualTier = visualTier;
    this.armor = p.armor;
    this.currentBullet = p.bullet;
    this.fireCdMul = p.fireCdMul * (1 - rankStep * 0.08);
    this.scoreMul = p.scoreMul * (1 + rankStep * 0.2);
    this.dropChanceBoost = p.dropChanceBoost + rankStep * 0.03;
  }

  override spec(): BulletSpec {
    return applyBulletLevel(BULLET_SPECS[this.currentBullet], this.visualTier);
  }

  override takeHit(attacker: Tank, damage: number, spec: BulletSpec): void {
    super.takeHit(attacker, Math.max(1, damage - this.armor), spec);
  }

  /** 是否为 Boss。 */
  get isBoss(): boolean {
    return this.profile.kind === 'boss';
  }
}

/** 按 AI 阶层与随机数生成敌人种类。 */
export function rollEnemyKind(tier: 1 | 2 | 3 | 4 | 5, rng: () => number): EnemyKind {
  const table: Record<number, Array<[EnemyKind, number]>> = {
    1: [
      ['scout', 0.7],
      ['gunner', 0.3],
    ],
    2: [
      ['scout', 0.4],
      ['gunner', 0.3],
      ['brute', 0.15],
      ['raider', 0.15],
    ],
    3: [
      ['scout', 0.25],
      ['gunner', 0.22],
      ['brute', 0.18],
      ['sniper', 0.15],
      ['raider', 0.12],
      ['demolisher', 0.08],
    ],
    4: [
      ['scout', 0.14],
      ['gunner', 0.18],
      ['brute', 0.18],
      ['sniper', 0.17],
      ['raider', 0.12],
      ['demolisher', 0.12],
      ['commander', 0.09],
    ],
    5: [
      ['scout', 0.08],
      ['gunner', 0.14],
      ['brute', 0.17],
      ['sniper', 0.17],
      ['raider', 0.12],
      ['demolisher', 0.15],
      ['commander', 0.17],
    ],
  };
  const rows = table[tier];
  const r = rng();
  let acc = 0;
  for (const [k, p] of rows) {
    acc += p;
    if (r <= acc) return k;
  }
  return rows[rows.length - 1][0];
}
