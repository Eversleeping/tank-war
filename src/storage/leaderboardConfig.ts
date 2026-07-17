/**
 * 服务器排行榜地址配置（纯逻辑，便于单测）。
 *
 * 默认使用同源 /api，部署到任意域名都无需额外配置；开发环境或独立后端
 * 可以通过 VITE_LEADERBOARD_URL 覆盖。
 */

export interface LeaderboardConfig {
  baseUrl: string;
}

/** 环境变量的最小可读形态（便于单测传入普通对象）。 */
export type EnvLike = Record<string, unknown> | undefined;

/**
 * 从环境变量对象解析排行榜配置（纯函数，单测入口）。
 */
export function readLeaderboardConfig(env: EnvLike): LeaderboardConfig {
  const url = str(env?.VITE_LEADERBOARD_URL).trim();
  return { baseUrl: url.length > 0 ? stripTrailingSlash(url) : '/api' };
}

/**
 * 运行时解析：从 Vite 注入的 import.meta.env 读取配置。
 */
export function resolveLeaderboardConfig(): LeaderboardConfig {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  return readLeaderboardConfig(env);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
