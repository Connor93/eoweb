import type { Vector2 } from '@/vector';

/** Tiles on the Bresenham line from `from` to `to`, excluding `from` and
 *  including `to`; empty when they are the same tile.
 *
 *  Mirrors reoserv's `tile_line` (src/utils/area_targeting.rs) step for step —
 *  the server uses it to decide whether a wall blocks a ground-area throw or
 *  blast. Pinned by scripts/tile-line-check.ts (same vectors as the Rust
 *  test); change both together. */
export function tileLine(from: Vector2, to: Vector2): Vector2[] {
  const dx = Math.abs(to.x - from.x);
  const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y);
  const sy = from.y < to.y ? 1 : -1;
  let x = from.x;
  let y = from.y;
  let err = dx + dy;
  const out: Vector2[] = [];
  while (!(x === to.x && y === to.y)) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    out.push({ x, y });
  }
  return out;
}
