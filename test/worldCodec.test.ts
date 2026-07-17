import { describe, expect, it } from 'vitest';
import type { TileKind } from '../src/game/types.ts';
import { packWorldTiles, unpackWorldTiles } from '../src/multiplayer/WorldCodec.ts';

describe('multiplayer world codec', () => {
  it('round-trips every tile kind with one byte per tile', () => {
    const tiles: TileKind[] = ['empty', 'brick', 'steel', 'water', 'bush', 'ice', 'base'];
    const packed = packWorldTiles(tiles);
    expect(packed).toHaveLength(tiles.length);
    expect(unpackWorldTiles(packed, tiles.length)).toEqual(tiles);
  });

  it('rejects truncated or unknown tile data', () => {
    expect(() => unpackWorldTiles('01', 3)).toThrow('length');
    expect(() => unpackWorldTiles('9', 1)).toThrow('tile');
  });
});
