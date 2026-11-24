import type { MapTileSpec } from 'eolib';
import type { Vector2 } from '@/vector';
import { tileLine } from './tile-line';
import { isTileSpecWalkable } from './tile-spec-walkable';

/** The tiles of a lasting ground area that glow: every tile of the square
 *  around `center` that is inside the map (`0..=width`, `0..=height`, as the
 *  server bounds it) and walkable, and — when `blastBlocked` — has a clear
 *  line from the centre. That is exactly where a wave can land (reoserv
 *  `select_area_targets`), so the glow never promises a hit that can't
 *  happen. Uses the same `tileLine` + walkable mirrors as ground aiming. */
export function zoneTiles(
  center: Vector2,
  radius: number,
  blastBlocked: boolean,
  width: number,
  height: number,
  specAt: (x: number, y: number) => MapTileSpec | undefined,
): Vector2[] {
  const out: Vector2[] = [];
  const blocks = (p: Vector2) => !isTileSpecWalkable(specAt(p.x, p.y));
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      if (x < 0 || y < 0 || x > width || y > height) continue;
      const tile = { x, y };
      if (blocks(tile)) continue;
      if (blastBlocked && tileLine(center, tile).some(blocks)) continue;
      out.push(tile);
    }
  }
  return out;
}
