import { CanvasSource, Texture } from 'pixi.js';
import { CombatElement } from '@/combat-overlay/element-colors';
import { HALF_TILE_HEIGHT, HALF_TILE_WIDTH } from '@/consts';
import {
  ARROW_SHAPES,
  arrowFacingIndex,
  arrowFacings,
  DEFAULT_ARROW_SHAPE,
  drawArrowCanvas,
  type ElementKey,
  isArrowShapeId,
} from '@/vfx-engine';
import type { ProjectileVisual } from './projectile';

// Pixi wrapper around the engine's arrow drawing. The geometry, shapes and
// palette all live in src/vfx-engine/arrows.ts so the AIO editor previews the
// exact same art; this file owns only the texture plumbing, which is Pixi and
// therefore cannot live in the framework-agnostic engine.

const FACINGS = arrowFacings(HALF_TILE_WIDTH, HALF_TILE_HEIGHT);

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

/** An arrow of one shape in one element's colours. Its four facing textures
 *  are drawn on first use and kept — at most 4 per (shape, element) pair in a
 *  session. */
export class ArrowVisual implements ProjectileVisual {
  private readonly shapeId: string;
  private readonly element: ElementKey;
  private readonly textures: (Texture | null)[] = [null, null, null, null];

  constructor(shapeId: string, element: ElementKey) {
    this.shapeId = shapeId;
    this.element = element;
  }

  textureFor(dx: number, dy: number): Texture | null {
    const index = arrowFacingIndex(dx, dy);
    let texture = this.textures[index];
    if (!texture) {
      const facing = FACINGS[index];
      texture = new Texture({
        source: new CanvasSource({
          resource: drawArrowCanvas(
            this.shapeId,
            this.element,
            facing.dx,
            facing.dy,
          ),
          scaleMode: 'nearest',
          label: `projectile-arrow:${this.shapeId}`,
        }),
      });
      this.textures[index] = texture;
    }
    return texture;
  }
}

const cache = new Map<string, ArrowVisual>();

/** One ArrowVisual per (shape, element) pair, shared by every projectile
 *  using it. An unknown shape id falls back to the default rather than
 *  throwing: pub values reach the client unvalidated, and a bow authored
 *  against a newer catalog must degrade, not break. */
export function getArrowVisual(
  shapeId: string,
  element: CombatElement,
): ArrowVisual {
  // isArrowShapeId, not a truthiness check — see drawArrowCanvas: a plain
  // object literal makes 'constructor'/'toString'/'__proto__' read as valid
  // shape ids.
  const id = isArrowShapeId(shapeId) ? shapeId : DEFAULT_ARROW_SHAPE;

  // Element precedence: ROLLED element -> the shape's own default -> neutral.
  // The roll wins because it IS the damage type, so the arrow must agree with
  // the damage number and the weapon glow. But an UNROLLED flame bow must
  // still fire FIRE-coloured flame arrows, not neutral ones — otherwise the
  // whole motivating case (a flaming bow that shoots flaming arrows) fails on
  // exactly the bows most likely to be authored with a shape.
  const resolved: ElementKey =
    element === CombatElement.Plain
      ? ARROW_SHAPES[id].defaultElement
      : elementKey(element);

  const key = `${id}:${resolved}`;
  let visual = cache.get(key);
  if (!visual) {
    visual = new ArrowVisual(id, resolved);
    cache.set(key, visual);
  }
  return visual;
}
