// Pins zoneTiles (which tiles of a lasting ground area glow) and the
// GroundZoneController's lifetime rules. Uses the same wall rule as the
// server's blast check: reoserv select_area_targets + tile_line.
// Run: npx tsx scripts/zone-tiles-check.ts
import { MapTileSpec } from 'eolib';
import { GroundZoneController } from '../src/controllers/ground-zone-controller';
import { zoneTiles } from '../src/utils/zone-tiles';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) {
    failed++;
    console.error(`FAIL ${name} ${detail}`);
  }
}

const open = () => undefined;
const wallAt =
  (wx: number, wy: number) =>
  (x: number, y: number): MapTileSpec | undefined =>
    x === wx && y === wy ? MapTileSpec.Wall : undefined;
const has = (tiles: { x: number; y: number }[], x: number, y: number) =>
  tiles.some((t) => t.x === x && t.y === y);

const centre = zoneTiles({ x: 5, y: 5 }, 1, true, 10, 10, open);
check('radius 1 open → 9 tiles', centre.length === 9, `${centre.length}`);

const corner = zoneTiles({ x: 0, y: 0 }, 1, true, 10, 10, open);
check(
  'corner clipped to bounds → 4 tiles',
  corner.length === 4,
  `${corner.length}`,
);

const blocked = zoneTiles({ x: 5, y: 5 }, 2, true, 10, 10, wallAt(6, 5));
check('blast-blocked → 23 tiles', blocked.length === 23, `${blocked.length}`);
check('wall tile excluded', !has(blocked, 6, 5));
check('tile behind wall excluded', !has(blocked, 7, 5));
check('(7,6) line clear → included', has(blocked, 7, 6));
check('(7,4) line clear → included', has(blocked, 7, 4));

const unblocked = zoneTiles({ x: 5, y: 5 }, 2, false, 10, 10, wallAt(6, 5));
check(
  'not blast-blocked → only the wall excluded',
  unblocked.length === 24,
  `${unblocked.length}`,
);
check('tile behind wall included when not blast-blocked', has(unblocked, 7, 5));

const zones = new GroundZoneController();
const now = 1000;
zones.add(
  {
    id: 1,
    skillId: 'arrow_storm',
    center: { x: 5, y: 5 },
    radius: 1,
    blastBlocked: true,
    element: 0,
    remainingMs: 1000,
  },
  now,
);
check('zone active before it ends', zones.active(now + 500).length === 1);
check('zone gone after remainingMs', zones.active(now + 1500).length === 0);
zones.add(
  {
    id: 2,
    skillId: 's',
    center: { x: 1, y: 1 },
    radius: 1,
    blastBlocked: true,
    element: 0,
    remainingMs: 5000,
  },
  now,
);
zones.pulse(2, now);
check(
  'pulse flashes',
  (zones.active(now + 100)[0]?.flashUntil ?? 0) > now + 100,
);
zones.remove(2);
check('remove drops the zone', zones.active(now).length === 0);
zones.add(
  {
    id: 3,
    skillId: 's',
    center: { x: 1, y: 1 },
    radius: 1,
    blastBlocked: true,
    element: 0,
    remainingMs: 5000,
  },
  now,
);
zones.clear();
check('clear (map change) drops every zone', zones.active(now).length === 0);

if (failed) {
  console.error(`zone-tiles: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('zone-tiles: all checks pass');
