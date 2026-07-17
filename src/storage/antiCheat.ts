/**
 * 排行榜提交的防作弊基础（纯逻辑，便于单测）。
 *
 * 两道防线：
 * 1) 合理性校验：给定关卡/击杀，推算一个"理论分数上限"，超出即判为不合理。
 *    上限刻意放宽（含各种加成的乐观估计），只拦截明显伪造的天文数字，
 *    不误伤正常高手。
 * 2) 简单签名：对提交载荷用共享盐做确定性哈希，服务端可用同盐复算校验。
 *    纯前端无法做到真正防篡改（盐可被扒出），这里只是抬高门槛 + 配合服务端
 *    做基础一致性检查。真正的防线仍需服务端权威校验。
 */

import { KILL_SCORE, stageBonus } from '../game/constants.ts';
import { isLeaderboardCategory, type LeaderboardCategory } from './leaderboardTypes.ts';

/** 校验用的分数载荷（与 ScoreEntry 的可校验子集一致）。 */
export interface ScorePayload {
  mode: LeaderboardCategory;
  name: string;
  score: number;
  stage: number;
  kills: number;
}

/** 单次击杀的最高得分：KILL_SCORE × 最高 scoreMul（Boss=6）。 */
export const MAX_KILL_SCORE_MUL = 6;

/** star 道具的固定加分（见 Game.applyPowerUp）。 */
const STAR_BONUS = 300;

/**
 * 给定关卡与击杀数，估算"理论分数上限"。
 *
 * 组成（全部取乐观上界）：
 * - 通关奖励：假设已清掉 stage 之前的每一关（含当前关也给满），累加 stageBonus。
 * - 击杀得分：每个击杀都按最高 scoreMul（Boss 档）算。
 * - 道具加分：假设每次击杀都掉落并拾取一个 star（+300）。
 * - 固定宽放量：再叠一个基础 slack，吸收其它零星加分与取整误差。
 */
export function scoreUpperBound(stage: number, kills: number): number {
  const s = Math.max(1, Math.floor(stage));
  const k = Math.max(0, Math.floor(kills));

  let bonusSum = 0;
  for (let i = 1; i <= s; i++) bonusSum += stageBonus(i);

  const killScore = k * KILL_SCORE * MAX_KILL_SCORE_MUL;
  const starScore = k * STAR_BONUS;
  const slack = 2000;

  return bonusSum + killScore + starScore + slack;
}

/**
 * 单关击杀数的理论上限（防止 kills 本身被伪造成天文数字）。
 * 每关敌人总数随关卡增长，这里给每关一个宽松上界再累加，含 Boss 关额外量。
 */
export function killsUpperBound(stage: number): number {
  const s = Math.max(1, Math.floor(stage));
  // 每关敌人总数上界（比 enemyTotal 更宽），再加 Boss 关的额外单位。
  let total = 0;
  for (let i = 1; i <= s; i++) {
    total += 12 + i * 2;
  }
  return total;
}

/**
 * 合理性校验。返回 { ok, reason }。
 * 拦截：非有限/负数字段、关卡过小、击杀超上限、分数超上限。
 */
export function validatePayload(p: ScorePayload): { ok: boolean; reason?: string } {
  if (!isLeaderboardCategory(p.mode)) return { ok: false, reason: 'invalid-mode' };
  if (!isFiniteNum(p.score) || !isFiniteNum(p.stage) || !isFiniteNum(p.kills)) {
    return { ok: false, reason: 'non-finite-field' };
  }
  if (p.score < 0 || p.kills < 0) return { ok: false, reason: 'negative-field' };
  if (p.stage < 1) return { ok: false, reason: 'stage-too-low' };
  if (p.kills > killsUpperBound(p.stage)) return { ok: false, reason: 'kills-too-high' };
  if (p.score > scoreUpperBound(p.stage, p.kills)) return { ok: false, reason: 'score-too-high' };
  return { ok: true };
}

// ---- 简单签名 ----

/**
 * 共享盐。前端可被扒出，仅作基础门槛；服务端应有自己的权威校验。
 * 独立成常量，便于前后端保持一致。
 */
export const SIGN_SALT = 'tankwar/lb/v1/8f3a';

/**
 * 32 位 FNV-1a 哈希，返回 8 位十六进制串。确定性、无依赖，前后端可复算。
 */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619（用位运算做 32 位无溢出乘法）
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 把载荷拼成稳定的规范串（字段顺序固定）。 */
function canonical(p: ScorePayload): string {
  return `${p.mode}|${p.name}|${p.score}|${p.stage}|${p.kills}`;
}

/** 生成提交签名：hash(salt | canonical)。 */
export function signPayload(p: ScorePayload, salt = SIGN_SALT): string {
  return fnv1a(`${salt}|${canonical(p)}`);
}

/** 校验签名是否与载荷匹配。 */
export function verifySignature(p: ScorePayload, sig: string, salt = SIGN_SALT): boolean {
  return signPayload(p, salt) === sig;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
