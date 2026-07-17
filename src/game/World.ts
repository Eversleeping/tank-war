import type { Rect, TileKind, Vec2 } from './types.ts';
import { rectsOverlap } from './types.ts';
import { TILE, mapSize } from './constants.ts';
import { baseMaxHpForStage } from './baseRules.ts';
import {
  CORRIDOR_GAP_EVERY,
  corridorRows,
  isCorridorGap,
  templateForStage,
  templateParams,
  type TerrainTemplate,
} from './terrain.ts';

export interface WorldEvents {
  onBaseHit?: (dmg: number) => void;
  onTileDestroyed?: (col: number, row: number, kind: TileKind) => void;
}

export interface WorldSize {
  cols: number;
  rows: number;
}

export function blocksTankTile(kind: TileKind): boolean {
  return kind === 'brick' || kind === 'steel' || kind === 'water' || kind === 'base';
}

/**
 * 关卡地图。以 tile 为单位存储静态地形。
 * 每次进入新关卡由 generate() 重新构建。
 */
export class World {
  cols: number;
  rows: number;
  tiles: TileKind[]; // 一维展平
  revision = 0;
  base!: Vec2;
  playerSpawn!: Vec2;
  enemySpawns!: Vec2[];
  baseAlive = true;
  baseHp: number;
  baseMaxHp: number;
  baseInvulnMs = 0;
  /** 本关地形模板（三种轮换）。供渲染/调试参考。 */
  template: TerrainTemplate = 'open';
  private events: WorldEvents;

  private stage: number;
  private rng: () => number;

  constructor(
    stage: number,
    rng: () => number,
    events: WorldEvents = {},
    sizeOverride?: WorldSize,
  ) {
    this.stage = stage;
    this.rng = rng;
    const { cols, rows } = sizeOverride ?? mapSize(stage);
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Array(cols * rows).fill('empty');
    this.baseMaxHp = baseMaxHpForStage(stage);
    this.baseHp = this.baseMaxHp;
    this.events = events;
    this.generate();
  }

  get widthPx(): number {
    return this.cols * TILE;
  }

  get heightPx(): number {
    return this.rows * TILE;
  }

  update(dt: number): void {
    if (this.baseInvulnMs > 0) {
      this.baseInvulnMs = Math.max(0, this.baseInvulnMs - dt * 1000);
    }
  }

  idx(col: number, row: number): number {
    return row * this.cols + col;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  get(col: number, row: number): TileKind {
    if (!this.inBounds(col, row)) return 'steel'; // 越界当作钢板
    return this.tiles[this.idx(col, row)];
  }

  set(col: number, row: number, k: TileKind): void {
    if (!this.inBounds(col, row)) return;
    const index = this.idx(col, row);
    if (this.tiles[index] === k) return;
    this.tiles[index] = k;
    this.revision += 1;
  }

  /** 该 tile 是否阻挡坦克通行 */
  blocksTank(k: TileKind): boolean {
    return blocksTankTile(k);
  }

  /** 该 tile 是否阻挡子弹 */
  blocksBullet(k: TileKind): boolean {
    return k === 'brick' || k === 'steel' || k === 'base';
  }

  /** 遍历与矩形相交的所有 tile 索引 */
  forEachTileInRect(r: Rect, fn: (col: number, row: number, k: TileKind) => void): void {
    const c0 = Math.max(0, Math.floor(r.x / TILE));
    const r0 = Math.max(0, Math.floor(r.y / TILE));
    const c1 = Math.min(this.cols - 1, Math.floor((r.x + r.w - 1) / TILE));
    const r1 = Math.min(this.rows - 1, Math.floor((r.y + r.h - 1) / TILE));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        fn(col, row, this.tiles[this.idx(col, row)]);
      }
    }
  }

  /** 坦克能否移动到该矩形位置 */
  canTankFit(r: Rect): boolean {
    if (r.x < 0 || r.y < 0 || r.x + r.w > this.widthPx || r.y + r.h > this.heightPx) {
      return false;
    }
    let blocked = false;
    this.forEachTileInRect(r, (_c, _r, k) => {
      if (this.blocksTank(k)) blocked = true;
    });
    return !blocked;
  }

  /** 子弹命中 tile 的处理（brick 一击破，steel 需要 breaksSteel） */
  hitTile(col: number, row: number, _damage: number, breaksSteel: boolean): boolean {
    const k = this.get(col, row);
    if (k === 'brick') {
      this.set(col, row, 'empty');
      this.events.onTileDestroyed?.(col, row, k);
      return true;
    }
    if (k === 'steel' && breaksSteel) {
      this.set(col, row, 'empty');
      this.events.onTileDestroyed?.(col, row, k);
      return true;
    }
    if (k === 'base') {
      // 命中基地本体
      this.damageBase();
      return true;
    }
    return this.blocksBullet(k);
  }

  damageBase(): void {
    if (!this.baseAlive || this.baseInvulnMs > 0) return;
    this.baseHp -= 1;
    this.events.onBaseHit?.(1);
    if (this.baseHp <= 0) {
      this.baseHp = 0;
      this.baseAlive = false;
    }
  }

  repairBase(hp: number, invulnMs: number): void {
    this.baseHp = Math.max(1, Math.min(this.baseMaxHp, Math.floor(hp)));
    this.baseAlive = true;
    this.baseInvulnMs = Math.max(0, invulnMs);
  }

  /** 基地矩形（占 2x2 tile） */
  baseRect(): Rect {
    return { x: this.base.x, y: this.base.y, w: TILE * 2, h: TILE * 2 };
  }

  /** 玩家出生点（世界坐标，坦克左上角） */
  spawnPlayerRect(size: number): Rect {
    return { x: this.playerSpawn.x, y: this.playerSpawn.y, w: size, h: size };
  }

  /**
   * 生成一张随机关卡。规则：
   * - 中央底部一块 2x2 tile 的基地，外围包一圈砖墙保护
   * - 敌人出生点固定在顶部三处
   * - 随机布置砖墙团块、若干钢块、水塘、草丛
   * - 玩家出生点在基地两侧任一格空地
   */
  generate(): void {
    const cols = this.cols;
    const rows = this.rows;
    const tier = Math.floor((this.stage - 1) / 5);
    const rng = this.rng;

    // 1) 全部清空
    this.tiles.fill('empty');

    // 2) 选定本关地形模板（三种轮换），取模板密度参数并叠加档位缩放
    this.template = templateForStage(this.stage);
    const tp = templateParams(this.template);

    // corridor 模板：先铺横向走廊墙（留缺口），把地图切成几条走廊
    if (tp.corridorWalls) {
      for (const wr of corridorRows(rows)) {
        for (let c = 1; c < cols - 1; c++) {
          if (isCorridorGap(c, CORRIDOR_GAP_EVERY)) continue;
          // 走廊墙以砖为主，偶尔钢块加固
          this.setForce(c, wr, rng() < 0.15 ? 'steel' : 'brick');
        }
      }
    }

    // 布砖块团块
    const brickBlobs = tp.brickBlobs + tier * 4 + Math.floor(rng() * 6);
    for (let i = 0; i < brickBlobs; i++) {
      const bc = 2 + Math.floor(rng() * (cols - 4));
      const br = 2 + Math.floor(rng() * (rows - 6));
      const w = 2 + Math.floor(rng() * 3);
      const h = 2 + Math.floor(rng() * 3);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if (rng() < 0.85) this.setIfEmpty(bc + dx, br + dy, 'brick');
        }
      }
    }

    // 钢块（少量，作为战术屏障）
    const steelCount = tp.steelCount + tier * 2 + Math.floor(rng() * 3);
    for (let i = 0; i < steelCount; i++) {
      const c = 2 + Math.floor(rng() * (cols - 4));
      const r = 2 + Math.floor(rng() * (rows - 6));
      const size = rng() < 0.6 ? 1 : 2;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          this.setForce(c + dx, r + dy, 'steel');
        }
      }
    }

    // 水塘
    const pools = tp.pools + tier + Math.floor(rng() * 2);
    for (let i = 0; i < pools; i++) {
      const c = 2 + Math.floor(rng() * (cols - 5));
      const r = 3 + Math.floor(rng() * (rows - 8));
      const w = 2 + Math.floor(rng() * 3);
      const h = 1 + Math.floor(rng() * 2);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          this.setForce(c + dx, r + dy, 'water');
        }
      }
    }

    // 草丛（后期更多，视野遮挡）
    const bushBlobs = tp.bushBlobs + tier * 3;
    for (let i = 0; i < bushBlobs; i++) {
      const c = 1 + Math.floor(rng() * (cols - 2));
      const r = 1 + Math.floor(rng() * (rows - 2));
      const w = 2 + Math.floor(rng() * 3);
      const h = 2 + Math.floor(rng() * 3);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if (rng() < 0.7) this.setIfEmpty(c + dx, r + dy, 'bush');
        }
      }
    }

    // 3) 布置基地（底部中央 2x2 base）
    const baseCol = Math.floor(cols / 2) - 1;
    const baseRow = rows - 3;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        this.setForce(baseCol + dx, baseRow + dy, 'base');
      }
    }
    this.base = { x: baseCol * TILE, y: baseRow * TILE };

    // 4) 基地外围一圈砖墙保护
    const wall: Array<[number, number]> = [
      [baseCol - 1, baseRow - 1],
      [baseCol, baseRow - 1],
      [baseCol + 1, baseRow - 1],
      [baseCol + 2, baseRow - 1],
      [baseCol - 1, baseRow],
      [baseCol + 2, baseRow],
      [baseCol - 1, baseRow + 1],
      [baseCol + 2, baseRow + 1],
    ];
    for (const [c, r] of wall) this.setForce(c, r, 'brick');

    // 5) 清出敌人出生点（顶部三处），确保 2x2 空地
    this.enemySpawns = [];
    const spawnCols = [1, Math.floor(cols / 2) - 1, cols - 3];
    for (const sc of spawnCols) {
      this.clearArea(sc, 0, 2, 2);
      this.enemySpawns.push({ x: sc * TILE, y: 0 });
    }

    // 6) 玩家出生点：基地左侧 4 格空地
    const psCol = Math.max(1, baseCol - 4);
    const psRow = baseRow;
    this.clearArea(psCol, psRow, 2, 2);
    this.playerSpawn = { x: psCol * TILE, y: psRow * TILE };
    // 从玩家出生点到基地清一条路
    for (let c = psCol + 2; c <= baseCol - 1; c++) {
      this.clearArea(c, psRow, 1, 2);
    }

    // 7) 连通性兜底：坦克占 2x2，通道必须 2 格宽才能通行。
    //    为每个敌人出生点纵向凿一条 2 格宽的竖井直达基地上方，
    //    再用一条 2 格宽的横向连廊把所有竖井与玩家出生点连通，
    //    保证走廊墙/要塞墙都不会把出生点或基地封死（钢块也一并清掉）。
    const linkRow = Math.max(2, baseRow - 3); // 连廊行（避开基地护墙）
    for (const s of this.enemySpawns) {
      const sc = Math.min(cols - 3, Math.max(1, Math.floor(s.x / TILE)));
      for (let r = 0; r <= linkRow + 1; r++) {
        this.clearArea(sc, r, 2, 1);
      }
    }
    // 2 格宽横向连廊，横跨全宽
    for (let c = 1; c < cols - 1; c++) {
      this.clearArea(c, linkRow, 1, 2);
    }
    // 把玩家出生点向上接入连廊
    for (let r = linkRow; r <= psRow; r++) {
      this.clearArea(psCol, r, 2, 1);
    }
  }

  private setIfEmpty(c: number, r: number, k: TileKind): void {
    if (!this.inBounds(c, r)) return;
    if (this.tiles[this.idx(c, r)] === 'empty') this.set(c, r, k);
  }

  private setForce(c: number, r: number, k: TileKind): void {
    this.set(c, r, k);
  }

  private clearArea(c: number, r: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(c + dx, r + dy, 'empty');
      }
    }
  }

  /** 一个矩形是否会被基地墙以外的任何 tile 阻挡（用于生成实体时选空地） */
  isRectFree(r: Rect, entities: Rect[]): boolean {
    if (!this.canTankFit(r)) return false;
    for (const e of entities) if (rectsOverlap(r, e)) return false;
    return true;
  }
}
