import type { Vector2 } from '@/vector';

/**
 * How far the player can see, in Manhattan tile distance.
 *
 * MUST match `VIEW_DISTANCE` / `VIEW_DISTANCE_DOWN` in reoserv's
 * `src/utils/in_range.rs` exactly. The server only sends entities that have
 * newly come *into* range as the player walks; it never says an entity has
 * left. `CleanupController` is what removes them, using this check. Drift in
 * either direction is a bug: a larger range here leaves frozen ghosts on
 * screen, a smaller one drops entities the server still thinks are visible and
 * they never come back until a refresh.
 *
 * `VIEW_DISTANCE_DOWN` is the longer reach toward the bottom of the screen
 * (strictly greater on both tile axes), inherited from the original EO check.
 */
const VIEW_DISTANCE = 17;
const VIEW_DISTANCE_DOWN = 20;

export function getDistance(a: Vector2, b: Vector2): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.floor(dx + dy);
}

/** Chebyshev (king-move) tile distance: max(|dx|, |dy|). Square, unlike
 *  getDistance (Manhattan). Mirrors reoserv's cast-range metric. */
export function getChebyshevDistance(a: Vector2, b: Vector2): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function inRange(observer: Vector2, other: Vector2): boolean {
  const distance = getDistance(observer, other);

  if (observer.x >= other.x || observer.y >= other.y) {
    return distance <= VIEW_DISTANCE;
  }

  return distance <= VIEW_DISTANCE_DOWN;
}
