import { describe, it, expect } from 'vitest';
import {
  CORRIDOR_GAP_EVERY,
  corridorRows,
  isCorridorGap,
  templateForStage,
  templateParams,
  type TerrainTemplate,
} from '../src/game/terrain.ts';
import { World } from '../src/game/World.ts';

function seq(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('templateForStage', () => {
  it('第 1 关固定 open', () => {
    expect(templateForStage(1)).toBe('open');
  });

  it('三种模板在连续关卡里都会出现', () => {
    const seen = new Set<TerrainTemplate>();
    for (let s = 1; s <= 12; s++) seen.add(templateForStage(s));
    expect(seen.has('open')).toBe(true);
    expect(seen.has('corridor')).toBe(true);
    expect(seen.has('fortress')).toBe(true);
  });

  it('按固定周期轮换（可复现）', () => {
    const a = [2, 3, 4, 5, 6, 7].map(templateForStage);
    const b = [2, 3, 4, 5, 6, 7].map(templateForStage);
    expect(a).toEqual(b);
  });

  it('对非整数关卡取整处理', () => {
    expect(templateForStage(2.9)).toBe(templateForStage(2));
  });
});

describe('templateParams', () => {
  it('要塞战墙密度最高，开阔战最低', () => {
    const fortress = templateParams('fortress');
    const open = templateParams('open');
    expect(fortress.brickBlobs).toBeGreaterThan(open.brickBlobs);
    expect(fortress.steelCount).toBeGreaterThan(open.steelCount);
  });

  it('仅 corridor 模板启用走廊墙', () => {
    expect(templateParams('corridor').corridorWalls).toBe(true);
    expect(templateParams('fortress').corridorWalls).toBe(false);
    expect(templateParams('open').corridorWalls).toBe(false);
  });

  it('所有数量参数非负', () => {
    for (const t of ['fortress', 'corridor', 'open'] as TerrainTemplate[]) {
      const p = templateParams(t);
      expect(p.brickBlobs).toBeGreaterThanOrEqual(0);
      expect(p.steelCount).toBeGreaterThanOrEqual(0);
      expect(p.pools).toBeGreaterThanOrEqual(0);
      expect(p.bushBlobs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('corridorRows', () => {
  it('行号落在顶部出生区与底部基地区之间', () => {
    const rows = 25;
    for (const r of corridorRows(rows)) {
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(rows - 4);
    }
  });

  it('地图太矮时不铺走廊墙', () => {
    expect(corridorRows(8)).toEqual([]);
  });

  it('地图越高走廊条带越多', () => {
    expect(corridorRows(40).length).toBeGreaterThanOrEqual(corridorRows(20).length);
  });
});

describe('isCorridorGap', () => {
  it('每隔 gapEvery 恰好留一个缺口', () => {
    let gaps = 0;
    for (let c = 0; c < CORRIDOR_GAP_EVERY * 4; c++) {
      if (isCorridorGap(c)) gaps++;
    }
    expect(gaps).toBe(4);
  });
});

/**
 * 关键的可通行性验收：对多组种子/关卡生成地图，
 * 用 BFS 验证每个敌人出生点都能走到基地相邻空地，
 * 确保走廊墙 / 要塞墙不会把出生点或基地封死。
 */
describe('World 生成可通行性', () => {
  // 砖墙可被坦克击破推进，故连通性只看"硬阻挡"（钢板/水/基地/越界）。
  // 该判定回答：出生点是否被不可摧毁地形彻底封死。
  function hardBlock(k: string): boolean {
    return k === 'steel' || k === 'water' || k === 'base';
  }

  function tankPassable(w: World, col: number, row: number): boolean {
    // 坦克占约 2x2 tile，用 2x2 窗口判断能否落脚（砖墙视为可通行）
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        if (hardBlock(w.get(col + dx, row + dy))) return false;
      }
    }
    return true;
  }

  function reachable(w: World, from: { x: number; y: number }, targetCol: number, targetRow: number): boolean {
    const startCol = Math.round(from.x / 32);
    const startRow = Math.round(from.y / 32);
    const seen = new Set<string>();
    const queue: Array<[number, number]> = [[startCol, startRow]];
    while (queue.length > 0) {
      const [c, r] = queue.shift()!;
      const key = `${c},${r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (Math.abs(c - targetCol) <= 1 && Math.abs(r - targetRow) <= 1) return true;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= w.cols - 1 || nr >= w.rows - 1) continue;
        if (!seen.has(`${nc},${nr}`) && tankPassable(w, nc, nr)) queue.push([nc, nr]);
      }
    }
    return false;
  }

  it('各关各种子：每个敌人出生点都能到达玩家出生点（进而抵达基地前）', () => {
    for (let stage = 1; stage <= 12; stage++) {
      for (const seed of [1, 42, 1337, 90210]) {
        const w = new World(stage, seq(stage * 1000 + seed));
        // 坦克无法站上基地本体（2x2 硬阻挡），故以玩家出生点（保证 2x2 空地且紧邻基地）
        // 作为连通性目标：任一敌人出生点都应能走到玩家出生点。
        const targetCol = Math.round(w.playerSpawn.x / 32);
        const targetRow = Math.round(w.playerSpawn.y / 32);
        for (const sp of w.enemySpawns) {
          expect(
            reachable(w, sp, targetCol, targetRow),
            `stage=${stage} seed=${seed} 出生点(${sp.x},${sp.y}) 无法到达玩家出生点`,
          ).toBe(true);
        }
      }
    }
  });

  it('玩家出生点能到达基地正上方（可保卫基地）', () => {
    for (let stage = 1; stage <= 10; stage++) {
      const w = new World(stage, seq(stage * 7 + 3));
      const baseCol = Math.round(w.base.x / 32);
      const baseRow = Math.round(w.base.y / 32);
      // 目标取基地上方 2 格处（空地区），玩家应能移动到基地跟前布防。
      expect(reachable(w, w.playerSpawn, baseCol, baseRow - 2)).toBe(true);
    }
  });
});
