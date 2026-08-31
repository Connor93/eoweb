import { CanvasSource, Texture } from 'pixi.js';
import { CombatElement } from '@/combat-overlay/element-colors';
import { HALF_TILE_HEIGHT, HALF_TILE_WIDTH } from '@/consts';
import { ELEMENTS, type ElementKey, type Ramp } from '@/vfx-engine';
import type { ProjectileVisual } from './projectile';

// Procedurally-drawn arrow, in the same house style as the generated skill
// effects: small, quantised, nearest-neighbour, coloured from the shared
// element ramps rather than a flat tint. No asset, no licence, no .egf work —
// and ELEMENTS is imported READ-ONLY, so the vendored vfx-engine is untouched
// and no cross-repo sync gate fires.
//
// EO has 4 facings, so there are 4 sprites. Which one is used is chosen from
// the actual travel vector rather than the Direction enum, so it stays correct
// however the caller derived its path.

// Geometry, all in design px. Tuning knobs — safe to adjust by eye, but keep
// SIZE comfortably above LENGTH: the arrow is drawn on the 2:1 iso diagonal
// from the canvas centre, so at LENGTH 22 it spans roughly x 5..27, y 9..22
// inside a 32px box. Raising LENGTH without raising SIZE will clip the head.

/** Canvas size. Comfortably larger than the arrow so the head never clips. */
const SIZE = 32;
/** Arrow length, tip to tail. */
const LENGTH = 22;
/** Half-width of the head. */
const HEAD = 4;
/** Length of the head. */
const HEAD_LEN = 7;
/** Shaft stroke width. */
const SHAFT_WIDTH = 2;
/** Fletching stroke width. Kept at shaft width so the barbs actually read. */
const FLETCH_WIDTH = 2;
/** How far the fletching barbs run forward from the tail. */
const FLETCH_LEN = 6;
/** How far the fletching barbs splay off the shaft. */
const FLETCH_SPREAD = 3.5;

/** Ramp indices, named. shadow -> mid -> base -> hot. */
// Ramp stops by ROLE, chosen for maximum VALUE separation so the three parts
// stay legible at ~20px. The ramp is [shadow, mid, base, hot]; on the neutral
// ramp those are roughly 35% / 66% / 96% / 100% lightness — `base` and `hot`
// are nearly the same colour, so using both (as the first version did, shaft
// on `mid` and head on `hot`) made the whole arrow read as one white shape.
//
// Spread across shadow -> mid -> base instead: a dark shaft so the longest
// part does not dominate, a mid-value fletching, and the tip on `base`, which
// the palette defines as the element's signature colour — so the brightest,
// most eye-catching part is the one that says which element this is.
const SHAFT_STOP = 0;
const FLETCH_STOP = 1;
const HEAD_STOP = 2;

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

function elementKey(element: CombatElement): ElementKey {
  switch (element) {
    case CombatElement.Fire:
      return 'fire';
    case CombatElement.Water:
      return 'water';
    case CombatElement.Earth:
      return 'earth';
    case CombatElement.Wind:
      return 'wind';
    case CombatElement.Light:
      return 'light';
    case CombatElement.Dark:
      return 'dark';
    default:
      return 'neutral';
  }
}

/** The four iso diagonals, as unit-ish vectors in SCREEN space. Derived from
 *  isoToScreen (sx = (x-y)*HW, sy = (x+y)*HH): Down => down-left,
 *  Right => down-right, Up => up-right, Left => up-left. */
// The four iso diagonals, in SCREEN space, in the same order facingIndex
// buckets them: down-right, down-left, up-right, up-left.
//
// These MUST carry the tile's 2:1 slope, not a 45-degree unit diagonal.
// isoToScreen is `sx = (x - y) * HALF_TILE_WIDTH, sy = (x + y) *
// HALF_TILE_HEIGHT`, so one tile of travel in any direction moves the sprite
// by (+/-32, +/-16) — 26.57 degrees from horizontal, not 45. Drawing the
// arrow along (+/-1, +/-1) pointed it 18.4 degrees off the line it actually
// flew, which read as a subtly crooked arrow on every shot.
//
// Derived from the tile constants rather than written as literals so the art
// cannot drift from the projection if tile size ever changes. Only the RATIO
// matters — drawArrow normalises.
const FACINGS = [
  { dx: HALF_TILE_WIDTH, dy: HALF_TILE_HEIGHT },
  { dx: -HALF_TILE_WIDTH, dy: HALF_TILE_HEIGHT },
  { dx: HALF_TILE_WIDTH, dy: -HALF_TILE_HEIGHT },
  { dx: -HALF_TILE_WIDTH, dy: -HALF_TILE_HEIGHT },
] as const;

function facingIndex(dx: number, dy: number): number {
  const right = dx >= 0;
  const down = dy >= 0;
  if (right && down) return 0;
  if (!right && down) return 1;
  if (right && !down) return 2;
  return 3;
}

function drawArrow(ramp: Ramp, dx: number, dy: number): Texture | null {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;

  // Normalise the facing onto the iso diagonal and centre the arrow.
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const tipX = cx + ux * (LENGTH / 2);
  const tipY = cy + uy * (LENGTH / 2);
  const tailX = cx - ux * (LENGTH / 2);
  const tailY = cy - uy * (LENGTH / 2);
  // Perpendicular, for the head barbs and the fletching.
  const px = -uy;
  const py = ux;

  // Shaft: the darkest stop. It is the longest part, so keeping it dark stops
  // it swamping the two smaller details.
  ctx.strokeStyle = hex(ramp[SHAFT_STOP]);
  ctx.lineWidth = SHAFT_WIDTH;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Head: a filled triangle at the tip, in the element's signature colour, so
  // the arrow reads point-first and carries its element at a glance.
  ctx.fillStyle = hex(ramp[HEAD_STOP]);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - ux * HEAD_LEN + px * HEAD,
    tipY - uy * HEAD_LEN + py * HEAD,
  );
  ctx.lineTo(
    tipX - ux * HEAD_LEN - px * HEAD,
    tipY - uy * HEAD_LEN - py * HEAD,
  );
  ctx.closePath();
  ctx.fill();

  // Fletching: two barbs swept back from the tail, at mid value. Drawn at
  // SHAFT_WIDTH rather than 1px — a single-pixel antialiased stroke this
  // short renders as a couple of faint pixels and effectively disappears,
  // which is why the first version looked like it had no fletching at all.
  ctx.strokeStyle = hex(ramp[FLETCH_STOP]);
  ctx.lineWidth = FLETCH_WIDTH;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(
    tailX + ux * FLETCH_LEN + px * FLETCH_SPREAD,
    tailY + uy * FLETCH_LEN + py * FLETCH_SPREAD,
  );
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(
    tailX + ux * FLETCH_LEN - px * FLETCH_SPREAD,
    tailY + uy * FLETCH_LEN - py * FLETCH_SPREAD,
  );
  ctx.stroke();

  return new Texture({
    source: new CanvasSource({
      resource: canvas,
      scaleMode: 'nearest',
      label: 'projectile-arrow',
    }),
  });
}

/** An arrow in one element's colours. Its four facing textures are drawn on
 *  first use and kept — there are at most 4 x 7 in a session. */
export class ArrowVisual implements ProjectileVisual {
  private readonly ramp: Ramp;
  private readonly textures: (Texture | null)[] = [null, null, null, null];

  constructor(element: CombatElement) {
    this.ramp = ELEMENTS[elementKey(element)];
  }

  textureFor(dx: number, dy: number): Texture | null {
    const index = facingIndex(dx, dy);
    let texture = this.textures[index];
    if (!texture) {
      const facing = FACINGS[index];
      texture = drawArrow(this.ramp, facing.dx, facing.dy);
      this.textures[index] = texture;
    }
    return texture;
  }
}

const cache = new Map<CombatElement, ArrowVisual>();

/** One ArrowVisual per element, shared by every projectile using it. */
export function getArrowVisual(element: CombatElement): ArrowVisual {
  let visual = cache.get(element);
  if (!visual) {
    visual = new ArrowVisual(element);
    cache.set(element, visual);
  }
  return visual;
}
