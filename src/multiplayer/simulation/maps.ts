import { TANK_SIZE, TILE } from '../../game/constants.ts';
import type { Vec2 } from '../../game/types.ts';
import { World, type WorldEvents } from '../../game/World.ts';

export const BRAWL_MAP_SIZE = { cols: 96, rows: 72 } as const;

export function createDuoWorld(stage: number, rng: () => number): World {
  return new World(stage, rng);
}

export function createBrawlWorld(rng: () => number, events: WorldEvents = {}): World {
  const world = new World(11, rng, events, BRAWL_MAP_SIZE);
  generateBrawlTerrain(world, rng);
  for (const point of brawlSpawnPoints(world)) clearTankArea(world, point);
  return world;
}

export function duoSpawnPoints(world: World): Vec2[] {
  const left = world.playerSpawn;
  const baseCol = Math.floor(world.base.x / TILE);
  const baseRow = Math.floor(world.base.y / TILE);
  const right = {
    x: Math.min(world.widthPx - TANK_SIZE, (baseCol + 4) * TILE),
    y: baseRow * TILE,
  };
  clearTankArea(world, right);
  return [left, right];
}

export function brawlSpawnPoints(world: World): Vec2[] {
  const margin = TILE;
  const maxX = world.widthPx - TANK_SIZE - margin;
  const maxY = world.heightPx - TANK_SIZE - margin;
  return [
    { x: margin, y: margin },
    { x: maxX, y: margin },
    { x: margin, y: maxY },
    { x: maxX, y: maxY },
    { x: world.widthPx / 2 - TANK_SIZE / 2, y: margin },
    { x: world.widthPx / 2 - TANK_SIZE / 2, y: maxY },
    { x: margin, y: world.heightPx / 2 - TANK_SIZE / 2 },
    { x: maxX, y: world.heightPx / 2 - TANK_SIZE / 2 },
    { x: world.widthPx * 0.25, y: world.heightPx * 0.25 },
    { x: world.widthPx * 0.7, y: world.heightPx * 0.7 },
  ];
}

function clearTankArea(world: World, point: Vec2): void {
  const col = Math.floor(point.x / TILE);
  const row = Math.floor(point.y / TILE);
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 2; dx++) world.set(col + dx, row + dy, 'empty');
  }
}

function generateBrawlTerrain(world: World, rng: () => number): void {
  world.tiles.fill('empty');
  world.revision += 1;

  const area = world.cols * world.rows;
  const clusters = Math.floor(area / 44);
  for (let i = 0; i < clusters; i++) {
    const roll = rng();
    const kind = roll < 0.55 ? 'brick'
      : roll < 0.68 ? 'steel'
        : roll < 0.80 ? 'water'
          : roll < 0.94 ? 'bush'
            : 'ice';
    const width = 1 + Math.floor(rng() * (kind === 'steel' ? 3 : 6));
    const height = 1 + Math.floor(rng() * (kind === 'steel' ? 3 : 5));
    const col = 2 + Math.floor(rng() * Math.max(1, world.cols - width - 4));
    const row = 2 + Math.floor(rng() * Math.max(1, world.rows - height - 4));
    const density = kind === 'brick' ? 0.78 : kind === 'bush' ? 0.68 : 0.88;
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        if (rng() <= density) world.set(col + dx, row + dy, kind);
      }
    }
  }

  const walls = Math.floor(area / 520);
  for (let i = 0; i < walls; i++) {
    const horizontal = rng() < 0.5;
    const length = 7 + Math.floor(rng() * 12);
    const col = 3 + Math.floor(rng() * (world.cols - (horizontal ? length : 1) - 6));
    const row = 3 + Math.floor(rng() * (world.rows - (horizontal ? 1 : length) - 6));
    for (let step = 0; step < length; step++) {
      if (step % 5 === 3 || rng() < 0.12) continue;
      world.set(col + (horizontal ? step : 0), row + (horizontal ? 0 : step), 'brick');
    }
  }
}
