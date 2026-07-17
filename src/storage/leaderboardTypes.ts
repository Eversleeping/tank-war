export const LEADERBOARD_CATEGORIES = ['single', 'duo', 'brawl'] as const;

export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

export const LEADERBOARD_LABELS: Record<LeaderboardCategory, string> = {
  single: '单人榜',
  duo: '双人榜',
  brawl: '十人榜',
};

export function isLeaderboardCategory(value: unknown): value is LeaderboardCategory {
  return typeof value === 'string' && LEADERBOARD_CATEGORIES.includes(value as LeaderboardCategory);
}
