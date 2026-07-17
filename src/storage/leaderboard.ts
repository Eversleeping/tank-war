/**
 * 排行榜唯一入口。所有成绩均读取和写入服务器。
 */
import { resolveLeaderboardConfig } from './leaderboardConfig.ts';
import { RemoteLeaderboard } from './remoteLeaderboard.ts';
import type { LeaderboardCategory } from './leaderboardTypes.ts';

export interface ScoreEntry {
  id: string;
  mode: LeaderboardCategory;
  name: string;
  score: number;
  stage: number;
  kills: number;
  createdAt: number; // 时间戳 ms
}

export interface LeaderboardProvider {
  top(mode: LeaderboardCategory, n?: number): Promise<ScoreEntry[]>;
  submit(entry: Omit<ScoreEntry, 'id' | 'createdAt'>): Promise<ScoreEntry>;
  clear(): Promise<void>;
}

function sanitizeName(name: string): string {
  const trimmed = (name || '').trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : '无名指挥官';
}

const config = resolveLeaderboardConfig();
export const leaderboard: LeaderboardProvider = new RemoteLeaderboard({ baseUrl: config.baseUrl });

/** 玩家代号本地持久化（用于跨次游戏预填）。 */
const NAME_KEY = 'tankwar/playerName/v1';

export function loadPlayerName(): string {
  try {
    return (localStorage.getItem(NAME_KEY) ?? '').slice(0, 16);
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): string {
  const cleaned = sanitizeName(name);
  try {
    localStorage.setItem(NAME_KEY, cleaned);
  } catch {
    // 静默失败
  }
  return cleaned;
}
