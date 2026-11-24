// Pins eoweb's tileLine to reoserv's `tile_line` (src/utils/area_targeting.rs,
// test `tile_line_vectors`). The vectors below are copied verbatim from there:
// if either side's line changes, both must change, or the client's "can't
// cast" colour disagrees with what the server actually allows.
// Run: npx tsx scripts/tile-line-check.ts
import { tileLine } from '../src/utils/tile-line';

type P = [number, number];
const cases: [P, P, P[]][] = [
  [[0, 0], [0, 0], []],
  [
    [0, 0],
    [3, 0],
    [
      [1, 0],
      [2, 0],
      [3, 0],
    ],
  ],
  [
    [0, 0],
    [2, 2],
    [
      [1, 1],
      [2, 2],
    ],
  ],
  [
    [0, 0],
    [3, 1],
    [
      [1, 0],
      [2, 1],
      [3, 1],
    ],
  ],
  [
    [3, 1],
    [0, 0],
    [
      [2, 1],
      [1, 0],
      [0, 0],
    ],
  ],
  [
    [5, 5],
    [5, 2],
    [
      [5, 4],
      [5, 3],
      [5, 2],
    ],
  ],
];

let failed = 0;
for (const [from, to, want] of cases) {
  const got = tileLine({ x: from[0], y: from[1] }, { x: to[0], y: to[1] }).map(
    (p) => [p.x, p.y] as P,
  );
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failed++;
    console.error(
      `tileLine(${from}) -> (${to}): got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
  }
}
if (failed) {
  console.error(`${failed} tile-line vector(s) failed`);
  process.exit(1);
}
console.log(`tile-line: ${cases.length} vectors match reoserv`);
