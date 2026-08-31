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
// from the canvas centre, so with the outline included it spans roughly
// x 1..28, y 5..23. Raising LENGTH or OUTLINE without raising SIZE will clip.
// The sprite is centre-anchored, so surplus transparent padding costs nothing
// but a few bytes of texture.

/** Canvas size. Deliberately roomier than the arrow needs, so the geometry
 *  constants below can be nudged without hunting a clipped tip. */
const SIZE = 36;
/** Arrow length, tip to tail. */
const LENGTH = 22;
/** Half-width of the head. */
const HEAD = 4;
/** Length of the head. */
const HEAD_LEN = 7;
/** Shaft stroke width. */
const SHAFT_WIDTH = 2;
/** How far forward the notch cuts into the fletching's rear edge, making it
 *  concave so the shape reads as a tail rather than a backwards arrowhead. */
const FLETCH_NOTCH = 2.5;
/** How far up the shaft the fletching's forward apex sits, from the tail. */
const FLETCH_LEN = 6;
/** How far the fletching vanes splay off the shaft. */
const FLETCH_SPREAD = 3.5;
/** How far the vanes trail past the tail, so the fan reads as behind it. */
const FLETCH_OVERHANG = 1.5;
/** Hair of shaft tucked under the head, so the join has no antialiased seam. */
const SHAFT_HEAD_OVERLAP = 1;
/** Outline thickness added on each side of every part. */
const OUTLINE = 1;

/** Outline colour. Deliberately a FIXED near-black rather than an element ramp
 *  stop: its job is separating the arrow from an arbitrary map background —
 *  grass, stone, water, cave floor — not carrying element identity, which the
 *  head already does. Derived from a ramp it would go pale on the light
 *  elements and stop separating anything. Same neutral family as the ramps'
 *  shadow stops, so it reads as part of the palette rather than pure black. */
const OUTLINE_COLOR = '#1c1917';

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

  // --- Geometry -----------------------------------------------------------
  //
  // The shaft STOPS where the head begins rather than running on to the tip.
  // Drawing it full-length put the head triangle on top of the shaft's last
  // stretch, so the head read as pasted over the shaft instead of fitted to
  // the end of it. SHAFT_HEAD_OVERLAP keeps a hair of overlap so antialiasing
  // cannot leave a seam at the join.
  const shaftEndX = tipX - ux * (HEAD_LEN - SHAFT_HEAD_OVERLAP);
  const shaftEndY = tipY - uy * (HEAD_LEN - SHAFT_HEAD_OVERLAP);

  // The fletching is a SOLID swallowtail at the nock, not two separate vanes.
  //
  // Two vanes drawn as lines splaying from a point up the shaft left the shaft
  // itself visible between them — three prongs radiating from one point, which
  // read as a tripod rather than fletching. Filling the shape covers that
  // stretch of shaft, so the back of the arrow is one solid mass.
  //
  // The rear edge is NOTCHED (concave, cut forward toward the apex) so the
  // shape cannot be mistaken for a second arrowhead pointing backwards — that
  // notch is what makes a dart tail read as a tail.
  const apexX = tailX + ux * FLETCH_LEN;
  const apexY = tailY + uy * FLETCH_LEN;
  const backX = tailX - ux * FLETCH_OVERHANG;
  const backY = tailY - uy * FLETCH_OVERHANG;
  const notchX = tailX + ux * FLETCH_NOTCH;
  const notchY = tailY + uy * FLETCH_NOTCH;

  // Path builders, shared by both passes below so the outline and the fill
  // are geometrically identical by construction and cannot drift apart.
  const shaftPath = () => {
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(shaftEndX, shaftEndY);
  };
  const fletchingPath = () => {
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(backX + px * FLETCH_SPREAD, backY + py * FLETCH_SPREAD);
    ctx.lineTo(notchX, notchY);
    ctx.lineTo(backX - px * FLETCH_SPREAD, backY - py * FLETCH_SPREAD);
    ctx.closePath();
  };
  const headPath = () => {
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
  };

  // --- Pass 1: outline ----------------------------------------------------
  //
  // EVERY part is outlined before ANY part is filled. Outlining each part
  // just before filling it would let a later part's outline cut a dark notch
  // into an earlier part's fill — most visibly where the head meets the
  // shaft. Two passes give one continuous outline around the whole
  // silhouette.
  //
  // Round caps and joins so the outline wraps the ends and corners rather
  // than leaving them squared off.
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = SHAFT_WIDTH + OUTLINE * 2;
  shaftPath();
  ctx.stroke();
  ctx.lineWidth = OUTLINE * 2;
  fletchingPath();
  ctx.stroke();
  // The head is filled, so its outline is a stroke centred on the same path:
  // half sits outside the triangle, which is the OUTLINE px we want.
  ctx.lineWidth = OUTLINE * 2;
  headPath();
  ctx.stroke();

  // --- Pass 2: fills ------------------------------------------------------
  //
  // ORDER MATTERS: the shaft is filled FIRST so the fletching covers the
  // stretch of it that runs through the tail. Fill the fletching first and the
  // shaft draws back over it, splitting it into two vanes with shaft showing
  // between them — the tripod look this shape exists to remove.
  ctx.lineCap = 'butt';
  ctx.strokeStyle = hex(ramp[SHAFT_STOP]);
  ctx.lineWidth = SHAFT_WIDTH;
  shaftPath();
  ctx.stroke();

  ctx.fillStyle = hex(ramp[FLETCH_STOP]);
  fletchingPath();
  ctx.fill();

  ctx.fillStyle = hex(ramp[HEAD_STOP]);
  headPath();
  ctx.fill();

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
