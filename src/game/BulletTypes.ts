import type { BulletKind } from './BulletKind.ts';

export type { BulletKind } from './BulletKind.ts';

export type BulletVisual =
  | 'orb'
  | 'streak'
  | 'shell'
  | 'needle'
  | 'pulse'
  | 'pellet'
  | 'diamond'
  | 'prism'
  | 'crystal'
  | 'laser'
  | 'plasma'
  | 'arc'
  | 'wave'
  | 'rail';

export interface BulletSpec {
  id: BulletKind;
  name: string;
  color: string;
  glow: string;
  visual: BulletVisual;
  speed: number; // px/s
  damage: number;
  cooldown: number; // ms
  energyCost: number; // 单次发射消耗；0 表示基础武器
  pierce: number; // 穿透次数（0 = 打中即消失）
  explosionRadius: number; // 爆炸半径（0 = 不爆炸）
  homing: boolean;
  bounces: number; // 反弹次数
  freezeMs: number;
  spread: number; // 一次发射几发（>=1）
  spreadAngle: number; // 散射夹角（弧度）
  size: number; // 视觉半径
  breaksSteel: boolean; // 能否击穿钢板
  burnMs?: number;
  burnDamage?: number;
  chainTargets?: number;
  chainRadius?: number;
  knockback?: number;
  desc: string;
  rarity: number; // 稀有度 1-5，越高越强
}

export const BULLET_SPECS: Record<BulletKind, BulletSpec> = {
  normal: {
    id: 'normal',
    name: '普通弹',
    color: '#fef08a',
    glow: 'rgba(254, 240, 138, 0.5)',
    visual: 'orb',
    speed: 340,
    damage: 1,
    cooldown: 380,
    energyCost: 0,
    pierce: 0,
    explosionRadius: 0,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 4,
    breaksSteel: false,
    desc: '标配。伤害 1，射速中等。无限使用。',
    rarity: 1,
  },
  rapid: {
    id: 'rapid',
    name: '速射弹',
    color: '#5eead4',
    glow: 'rgba(94, 234, 212, 0.6)',
    visual: 'streak',
    speed: 460,
    damage: 1,
    cooldown: 140,
    energyCost: 5,
    pierce: 0,
    explosionRadius: 0,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 3,
    breaksSteel: false,
    desc: '射速极快，弹丸细小。适合近距离压制。',
    rarity: 2,
  },
  heavy: {
    id: 'heavy',
    name: '重炮弹',
    color: '#fb923c',
    glow: 'rgba(251, 146, 60, 0.7)',
    visual: 'shell',
    speed: 260,
    damage: 3,
    cooldown: 900,
    energyCost: 24,
    pierce: 0,
    explosionRadius: 0,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 6,
    breaksSteel: true,
    desc: '伤害 3，可击破钢板。弹速慢，冷却长。',
    rarity: 3,
  },
  pierce: {
    id: 'pierce',
    name: '穿甲弹',
    color: '#a78bfa',
    glow: 'rgba(167, 139, 250, 0.7)',
    visual: 'needle',
    speed: 520,
    damage: 2,
    cooldown: 700,
    energyCost: 20,
    pierce: 3,
    explosionRadius: 0,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 3,
    breaksSteel: false,
    desc: '一发穿透最多 3 个敌人。伤害 2。',
    rarity: 3,
  },
  explosive: {
    id: 'explosive',
    name: '爆破弹',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.7)',
    visual: 'pulse',
    speed: 280,
    damage: 2,
    cooldown: 900,
    energyCost: 28,
    pierce: 0,
    explosionRadius: 64,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 6,
    breaksSteel: false,
    desc: '命中或到达行程后爆炸，2 格半径 AOE。',
    rarity: 4,
  },
  spread: {
    id: 'spread',
    name: '散射弹',
    color: '#fde047',
    glow: 'rgba(253, 224, 71, 0.6)',
    visual: 'pellet',
    speed: 330,
    damage: 1,
    cooldown: 620,
    energyCost: 18,
    pierce: 0,
    explosionRadius: 0,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 3,
    spreadAngle: 0.32,
    size: 4,
    breaksSteel: false,
    desc: '扇形三连发。适合清群和覆盖射击。',
    rarity: 3,
  },
  homing: {
    id: 'homing',
    name: '追踪弹',
    color: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.7)',
    visual: 'diamond',
    speed: 260,
    damage: 2,
    cooldown: 900,
    energyCost: 26,
    pierce: 0,
    explosionRadius: 0,
    homing: true,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 5,
    breaksSteel: false,
    desc: '自动追踪最近的敌人。伤害 2。',
    rarity: 4,
  },
  bounce: {
    id: 'bounce',
    name: '弹跳弹',
    color: '#c4b5fd',
    glow: 'rgba(196, 181, 253, 0.6)',
    visual: 'prism',
    speed: 360,
    damage: 2,
    cooldown: 700,
    energyCost: 18,
    pierce: 0,
    explosionRadius: 0,
    homing: false,
    bounces: 3,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 4,
    breaksSteel: false,
    desc: '碰到墙壁反弹 3 次，绕墙杀敌。',
    rarity: 3,
  },
  freeze: {
    id: 'freeze',
    name: '冰冻弹',
    color: '#bfdbfe',
    glow: 'rgba(191, 219, 254, 0.7)',
    visual: 'crystal',
    speed: 320,
    damage: 1,
    cooldown: 700,
    energyCost: 24,
    pierce: 0,
    explosionRadius: 40,
    homing: false,
    bounces: 0,
    freezeMs: 2400,
    spread: 1,
    spreadAngle: 0,
    size: 5,
    breaksSteel: false,
    desc: '命中后使敌人减速 2.4 秒，可群体触发。',
    rarity: 4,
  },
  laser: {
    id: 'laser',
    name: '聚焦激光',
    color: '#f0abfc',
    glow: 'rgba(240, 171, 252, 0.85)',
    visual: 'laser',
    speed: 920,
    damage: 2,
    cooldown: 850,
    energyCost: 26,
    pierce: 8,
    explosionRadius: 0,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 2.5,
    breaksSteel: false,
    desc: '按住开火聚能，松开瞬发贯穿整条路径；蓄力越满伤害与光束越强。',
    rarity: 4,
  },
  plasma: {
    id: 'plasma',
    name: '灼热等离子',
    color: '#fb7185',
    glow: 'rgba(251, 113, 133, 0.9)',
    visual: 'plasma',
    speed: 250,
    damage: 2,
    cooldown: 820,
    energyCost: 30,
    pierce: 0,
    explosionRadius: 52,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 7,
    breaksSteel: false,
    burnMs: 3000,
    burnDamage: 1,
    desc: '爆炸后点燃范围内敌人，持续灼烧 3 秒。',
    rarity: 4,
  },
  chain: {
    id: 'chain',
    name: '连锁电弧',
    color: '#60a5fa',
    glow: 'rgba(96, 165, 250, 0.95)',
    visual: 'arc',
    speed: 410,
    damage: 2,
    cooldown: 760,
    energyCost: 32,
    pierce: 0,
    explosionRadius: 0,
    homing: true,
    bounces: 0,
    freezeMs: 350,
    spread: 1,
    spreadAngle: 0,
    size: 5,
    breaksSteel: false,
    chainTargets: 4,
    chainRadius: 150,
    desc: '命中后跳向附近最多 4 个目标，并造成短暂电击停顿。',
    rarity: 5,
  },
  shockwave: {
    id: 'shockwave',
    name: '震荡冲击弹',
    color: '#2dd4bf',
    glow: 'rgba(45, 212, 191, 0.9)',
    visual: 'wave',
    speed: 300,
    damage: 1,
    cooldown: 880,
    energyCost: 30,
    pierce: 0,
    explosionRadius: 92,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 7,
    breaksSteel: false,
    knockback: 74,
    desc: '大范围冲击波，将敌人推离爆心并打乱阵型。',
    rarity: 4,
  },
  railgun: {
    id: 'railgun',
    name: '磁轨歼灭弹',
    color: '#f8fafc',
    glow: 'rgba(125, 211, 252, 1)',
    visual: 'rail',
    speed: 780,
    damage: 5,
    cooldown: 1200,
    energyCost: 46,
    pierce: 8,
    explosionRadius: 0,
    homing: false,
    bounces: 0,
    freezeMs: 0,
    spread: 1,
    spreadAngle: 0,
    size: 4,
    breaksSteel: true,
    knockback: 24,
    desc: '超高伤害直线贯穿，可击穿钢板与整列敌军。',
    rarity: 5,
  },
};

/** 可作为战利品的特殊弹种池（不含普通弹）。 */
export const PICKUP_POOL: BulletKind[] = [
  'rapid',
  'heavy',
  'pierce',
  'explosive',
  'spread',
  'homing',
  'bounce',
  'freeze',
  'laser',
  'plasma',
  'chain',
  'shockwave',
  'railgun',
];

/**
 * 某稀有度在给定关卡的抽取权重。
 *
 * 权重 = mult(stage)^(rarity-1)，其中 mult 随关卡线性上升：
 * - 低关卡 mult < 1 → 低稀有更容易出现（新手期不会被高稀有淹没）
 * - 高关卡 mult > 1 → 高稀有更容易出现（后期奖励更强）
 *
 * 该函数纯粹且单调：对固定关卡，rarity 越高权重按 mult 的幂次单调变化；
 * 对固定 rarity(>1)，stage 越高权重越大。
 */
export function rarityWeight(rarity: number, stage: number): number {
  const s = Math.max(1, Math.floor(stage));
  const mult = 0.6 + 0.06 * (s - 1);
  return Math.pow(mult, rarity - 1);
}

/**
 * 挑选 count 种不重复的特殊炮弹用于三选一。
 *
 * 传入 stage 时按稀有度加权（高关卡更易出高稀有）；不传 stage 时等概率。
 * 加权采样为"不放回"，因此不会重复。
 */
export function rollPickupChoices(
  rng: () => number,
  count = 3,
  stage?: number,
): BulletKind[] {
  const chosen: BulletKind[] = [];
  const local = [...PICKUP_POOL];
  while (chosen.length < count && local.length > 0) {
    let i: number;
    if (stage === undefined) {
      i = Math.floor(rng() * local.length);
    } else {
      i = weightedIndex(local, stage, rng());
    }
    chosen.push(local[i]);
    local.splice(i, 1);
  }
  return chosen;
}

/** 按稀有度权重在 pool 中选一个下标；r 为 [0,1) 随机数。 */
function weightedIndex(pool: BulletKind[], stage: number, r: number): number {
  const weights = pool.map((k) => rarityWeight(BULLET_SPECS[k].rarity, stage));
  const total = weights.reduce((a, b) => a + b, 0);
  let target = r * total;
  for (let i = 0; i < pool.length; i++) {
    target -= weights[i];
    if (target < 0) return i;
  }
  return pool.length - 1;
}
