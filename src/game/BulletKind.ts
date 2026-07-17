export const BULLET_KINDS = [
  'normal',
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
] as const;

export type BulletKind = (typeof BULLET_KINDS)[number];

const BULLET_KIND_SET: ReadonlySet<string> = new Set(BULLET_KINDS);

export function isBulletKind(value: unknown): value is BulletKind {
  return typeof value === 'string' && BULLET_KIND_SET.has(value);
}
