import type { Client } from '@/client';
import type { Vector2 } from '@/vector';
import { getNextCoords } from './get-next-coords';
import { isTileSpecWalkable } from './tile-spec-walkable';

/** Tiles the equipped weapon reaches, nearest-first, as a straight ray in the
 *  character's facing direction.
 *
 *  Mirrors reoserv's `get_attack_target` (src/map/map/character/attack.rs):
 *  step `range` times from the attacker, stopping at the first blocking tile
 *  spec. Deliberately does NOT consult `MapController.canWalk` — that also
 *  rejects occupied tiles, which would truncate the ray at exactly the NPC
 *  being aimed at.
 *
 *  Empty for melee: the family-55 range map is sparse and only carries
 *  reach > 1.
 *
 *  Known gap: the server forces range 1 inside the arena, which the client has
 *  no state for, so the ray over-promises there. */
export function attackRayTiles(client: Client): Vector2[] {
  const range = client.itemAttackRanges.get(client.equipment.weapon);
  if (!range || range <= 1) {
    return [];
  }

  const character = client.getPlayerCharacter();
  const map = client.map;
  if (!character || !map) {
    return [];
  }

  const tiles: Vector2[] = [];
  let current: Vector2 = { x: character.coords.x, y: character.coords.y };

  for (let step = 0; step < range; step++) {
    const next = getNextCoords(
      current,
      character.direction,
      map.width,
      map.height,
    );

    // getNextCoords pins at the map bounds, so a repeated coord means the ray
    // ran off the edge.
    if (next.x === current.x && next.y === current.y) {
      break;
    }

    if (!isTileSpecWalkable(client.mapRenderer.getTileSpecAt(next))) {
      break;
    }

    tiles.push(next);
    current = next;
  }

  return tiles;
}
