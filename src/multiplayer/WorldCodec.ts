import type { TileKind } from '../game/types.ts';

const TILE_CODES: TileKind[] = ['empty', 'brick', 'steel', 'water', 'bush', 'ice', 'base'];

export function packWorldTiles(tiles: TileKind[]): string {
  return tiles.map((tile) => String(TILE_CODES.indexOf(tile))).join('');
}

export function unpackWorldTiles(packed: string, expectedLength: number): TileKind[] {
  if (packed.length !== expectedLength) throw new Error('Invalid packed world length');
  return Array.from(packed, (code) => {
    const tile = TILE_CODES[Number(code)];
    if (!tile) throw new Error('Invalid packed world tile');
    return tile;
  });
}
