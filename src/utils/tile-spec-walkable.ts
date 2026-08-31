import { MapTileSpec } from 'eolib';

// Tile specs that block movement. Mirrors reoserv's `is_tile_walkable`
// (src/map/map/utils/is_tile_walkable.rs) exactly — the server uses this same
// list to terminate an attack ray, so the two must stay in sync.
const BLOCKING_SPECS: readonly MapTileSpec[] = [
  MapTileSpec.Wall,
  MapTileSpec.ChairDown,
  MapTileSpec.ChairLeft,
  MapTileSpec.ChairRight,
  MapTileSpec.ChairUp,
  MapTileSpec.ChairDownRight,
  MapTileSpec.ChairUpLeft,
  MapTileSpec.ChairAll,
  MapTileSpec.Chest,
  MapTileSpec.BankVault,
  MapTileSpec.Edge,
  MapTileSpec.Board1,
  MapTileSpec.Board2,
  MapTileSpec.Board3,
  MapTileSpec.Board4,
  MapTileSpec.Board5,
  MapTileSpec.Board6,
  MapTileSpec.Board7,
  MapTileSpec.Board8,
  MapTileSpec.Jukebox,
];

/** Whether a tile's spec alone permits standing on it. Occupancy (NPCs,
 *  characters) is a separate question — see `MapController.canWalk`. An
 *  unspecced tile is walkable, matching the server. */
export function isTileSpecWalkable(spec: MapTileSpec | undefined): boolean {
  if (spec === undefined) {
    return true;
  }
  return !BLOCKING_SPECS.includes(spec);
}
