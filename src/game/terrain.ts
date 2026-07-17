/**
 * 关卡地形模板的纯逻辑。与 World 的实际 tile 写入解耦，便于单测。
 *
 * 三种模板轮换，营造不同的战斗节奏：
 * - fortress：要塞战。中央大量砖墙/钢块围合，强调拆墙推进。
 * - corridor：走廊战。横向条带墙把地图切成几条走廊，强调卡位对枪。
 * - open：开阔战。障碍稀疏，强调机动与远程。
 *
 * 模板按 stage 轮换（Boss 关固定用 fortress，给 Boss 留活动空间由 World 处理）。
 */

export type TerrainTemplate = 'fortress' | 'corridor' | 'open';

const CYCLE: TerrainTemplate[] = ['open', 'corridor', 'fortress'];

/**
 * 按关卡选模板。第 1 关固定 open（新手友好），
 * 其余关卡按 (stage-1) 对循环取模，确保三种模板轮换出现。
 */
export function templateForStage(stage: number): TerrainTemplate {
  const s = Math.floor(stage);
  if (s <= 1) return 'open';
  return CYCLE[(s - 1) % CYCLE.length];
}

export interface TemplateParams {
  /** 砖墙团块数量的基础值 */
  brickBlobs: number;
  /** 钢块数量的基础值 */
  steelCount: number;
  /** 水塘数量的基础值 */
  pools: number;
  /** 草丛团块数量的基础值 */
  bushBlobs: number;
  /** 是否铺设横向走廊墙（corridor 专用） */
  corridorWalls: boolean;
}

/**
 * 各模板的地形数量参数（未叠加档位加成，由 World 再乘档位系数）。
 * 数值仅描述"相对密度"，World 会在此基础上加 tier 缩放。
 */
export function templateParams(template: TerrainTemplate): TemplateParams {
  switch (template) {
    case 'fortress':
      return { brickBlobs: 22, steelCount: 10, pools: 2, bushBlobs: 5, corridorWalls: false };
    case 'corridor':
      return { brickBlobs: 8, steelCount: 4, pools: 1, bushBlobs: 6, corridorWalls: true };
    case 'open':
      return { brickBlobs: 8, steelCount: 3, pools: 3, bushBlobs: 8, corridorWalls: false };
  }
}

/**
 * 走廊墙的行号列表：把地图纵向切成若干条走廊。
 * 每条墙在若干列上留缺口（由 World 在写入时按 gapEvery 跳过）。
 * 返回的行号均落在 [3, rows-4]，避开顶部出生区与底部基地区。
 */
export function corridorRows(rows: number): number[] {
  const usable = rows - 7; // 去掉顶部 3 行、底部 4 行
  if (usable <= 4) return [];
  const bands = Math.max(1, Math.floor(usable / 5));
  const rowsOut: number[] = [];
  for (let i = 1; i <= bands; i++) {
    const r = 3 + Math.round((usable * i) / (bands + 1));
    rowsOut.push(r);
  }
  return rowsOut;
}

/** 走廊墙上每隔几格留一个通行缺口。 */
export const CORRIDOR_GAP_EVERY = 5;

/** 某列是否为走廊墙的缺口（可通行）。 */
export function isCorridorGap(col: number, gapEvery = CORRIDOR_GAP_EVERY): boolean {
  return col % gapEvery === gapEvery - 1;
}
