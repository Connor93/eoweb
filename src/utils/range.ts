import type { Vector2 } from '@/vector';

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
    return distance <= 11;
  }

  return distance <= 14;
}
