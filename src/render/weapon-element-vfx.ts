import { Gender } from 'eolib';
import { BlurFilter, Container, Sprite, type Texture } from 'pixi.js';
import { CharacterFrame } from '@/atlas';
import {
  CombatElement,
  combatElementColor,
} from '@/combat-overlay/element-colors';
import { HALF_TILE_HEIGHT, TILE_HEIGHT } from '@/consts';

// ---------------------------------------------------------------------------
// Procedural Pixi VFX for melee weapons that carry a rolled element.
//
// The glow uses the WEAPON'S OWN per-frame sprite as its shape — a tinted,
// blurred, additively-blended copy of the weapon graphic laid exactly over the
// composited weapon. So the glow takes the actual weapon's silhouette (blade,
// staff, etc.) rather than a generic blob, recoloured per element. The weapon
// texture itself is fetched + cached by WeaponElementController (it needs the
// gfx loader); this module owns the pure render pieces.
// ---------------------------------------------------------------------------

/** Convert the combat-overlay CSS hex (e.g. "#fb923c") to a numeric Pixi tint. */
export function elementColorNumber(e: CombatElement): number {
  return Number.parseInt(combatElementColor(e).slice(1), 16);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Glow flare driven by the melee attack progress (0..1). Ramps up through the
// wind-up, peaks at the wind-up→swing transition (~0.15, matching
// CharacterAttackAnimation.WIND_UP_FRACTION) then decays over the follow-through.
const SWING_PEAK = 0.15;
const SWING_DECAY_END = 0.6;
function swingIntensity(progress: number): number {
  if (progress <= 0) return 0;
  if (progress < SWING_PEAK) return progress / SWING_PEAK;
  if (progress < SWING_DECAY_END) {
    return 1 - (progress - SWING_PEAK) / (SWING_DECAY_END - SWING_PEAK);
  }
  return 0;
}

interface ElementVfxConfig {
  /** Pixi tint applied to the weapon-shaped glow. */
  tint: number;
  /** Resting glow alpha while the weapon is equipped but not swinging. */
  idleAlpha: number;
  /** Glow alpha at the peak of a swing. */
  peakAlpha: number;
}

/** Per-element visual config. Shape comes from the weapon sprite; colour +
 *  minor intensity tweaks differentiate elements. Plain is never rendered.
 *  Alpha drives the sharp core pass; the halo pass derives from it. */
const WEAPON_ELEMENT_VFX: Record<CombatElement, ElementVfxConfig> = {
  [CombatElement.Plain]: { tint: 0xffffff, idleAlpha: 0, peakAlpha: 0 },
  [CombatElement.Fire]: {
    tint: elementColorNumber(CombatElement.Fire),
    idleAlpha: 0.9,
    peakAlpha: 1.0,
  },
  [CombatElement.Water]: {
    tint: elementColorNumber(CombatElement.Water),
    idleAlpha: 0.85,
    peakAlpha: 1.0,
  },
  [CombatElement.Earth]: {
    tint: elementColorNumber(CombatElement.Earth),
    idleAlpha: 0.85,
    peakAlpha: 1.0,
  },
  [CombatElement.Wind]: {
    tint: elementColorNumber(CombatElement.Wind),
    idleAlpha: 0.85,
    peakAlpha: 1.0,
  },
  [CombatElement.Light]: {
    tint: elementColorNumber(CombatElement.Light),
    idleAlpha: 0.95,
    peakAlpha: 1.0,
  },
  [CombatElement.Dark]: {
    tint: elementColorNumber(CombatElement.Dark),
    idleAlpha: 0.9,
    peakAlpha: 1.0,
  },
};

// ── Weapon frame → graphic + screen anchoring ───────────────────────────────
//
// The compositor draws the weapon onto a fixed 100×100 canvas centered at
// (50 + offset.x, 50 + offset.y), then crops to tight bounds. We render a
// separate copy of that same weapon graphic and place its center where the
// composited weapon lands on screen, derived from the tile-center + frame
// offset the character sprite itself uses (see MapRenderer.addCharacterSprites):
//   x = tileCenterX + frameOffset.x ± off.x   (− when the sprite is mirrored)
//   y = tileCenterY + frameOffset.y + off.y + Y_ANCHOR_OFFSET
// The tight-crop bounds cancel out, so this needs NO frame.x/frame.y — those
// are atlas-packing coordinates (getFrameTexture uses them as the sub-texture
// rect), not canvas offsets, and must not be used here.
//
// Y_ANCHOR_OFFSET mirrors the compositor's yOffset geometry: a canvas row cy
// maps to screen via (cy − CHARACTER_FRAME_SIZE + TILE_HEIGHT −
// HALF_HALF_TILE_HEIGHT) relative to the tile center; with cy = HALF + off.y
// the constant part is HALF − CHARACTER_FRAME_SIZE + TILE_HEIGHT −
// HALF_HALF_TILE_HEIGHT.
//
// WEAPON_FRAME_MAP + WEAPON_OFFSETS are copies of the same tables in
// src/atlas/compositor.worker.ts — that worker keeps its own copies (it can't
// share across the worker boundary), so these must stay in sync with it.
//
// Built lazily, not at module load: `CharacterFrame` comes from `@/atlas`,
// which sits in an import cycle with this module (atlas → map → render → here
// → atlas). Referencing the enum at top level hits its temporal dead zone;
// deferring to call time lets every module finish initializing first.
const CHARACTER_FRAME_SIZE = 100;
const HALF_CHARACTER_FRAME_SIZE = 50;
// Constant part of the canvas-row → screen-y mapping (see header comment).
// HALF_TILE_HEIGHT / 2 mirrors the compositor's HALF_HALF_TILE_HEIGHT (8).
const Y_ANCHOR_OFFSET =
  HALF_CHARACTER_FRAME_SIZE -
  CHARACTER_FRAME_SIZE +
  TILE_HEIGHT -
  HALF_TILE_HEIGHT / 2;

// The weapon-front graphic (drawn over the body during the down-right swing).
const WEAPON_FRONT_GRAPHIC = 17;

let frameTables: {
  graphic: Record<number, number>;
  offsets: Record<number, Record<number, { x: number; y: number }>>;
} | null = null;

function getFrameTables() {
  if (frameTables) return frameTables;
  frameTables = {
    // CharacterFrame → behind-weapon graphic index (1-based within the weapon
    // sprite sheet). graphicId = (weapon - 1) * 100 + index.
    graphic: {
      [CharacterFrame.StandingDownRight]: 1,
      [CharacterFrame.StandingUpLeft]: 2,
      [CharacterFrame.WalkingDownRight1]: 3,
      [CharacterFrame.WalkingDownRight2]: 4,
      [CharacterFrame.WalkingDownRight3]: 5,
      [CharacterFrame.WalkingDownRight4]: 6,
      [CharacterFrame.WalkingUpLeft1]: 7,
      [CharacterFrame.WalkingUpLeft2]: 8,
      [CharacterFrame.WalkingUpLeft3]: 9,
      [CharacterFrame.WalkingUpLeft4]: 10,
      [CharacterFrame.MeleeAttackDownRight1]: 13,
      [CharacterFrame.MeleeAttackDownRight2]: 14,
      [CharacterFrame.MeleeAttackUpLeft1]: 15,
      [CharacterFrame.MeleeAttackUpLeft2]: 16,
    },
    offsets: {
      [Gender.Female]: {
        [CharacterFrame.StandingDownRight]: { x: -9, y: -6 },
        [CharacterFrame.StandingUpLeft]: { x: -9, y: -6 },
        [CharacterFrame.WalkingDownRight1]: { x: -9, y: -7 },
        [CharacterFrame.WalkingDownRight2]: { x: -9, y: -7 },
        [CharacterFrame.WalkingDownRight3]: { x: -9, y: -7 },
        [CharacterFrame.WalkingDownRight4]: { x: -9, y: -7 },
        [CharacterFrame.WalkingUpLeft1]: { x: -9, y: -7 },
        [CharacterFrame.WalkingUpLeft2]: { x: -9, y: -7 },
        [CharacterFrame.WalkingUpLeft3]: { x: -9, y: -7 },
        [CharacterFrame.WalkingUpLeft4]: { x: -9, y: -7 },
        [CharacterFrame.MeleeAttackDownRight1]: { x: -8, y: -6 },
        [CharacterFrame.MeleeAttackDownRight2]: { x: -10, y: -6 },
        [CharacterFrame.MeleeAttackUpLeft1]: { x: -8, y: -6 },
        [CharacterFrame.MeleeAttackUpLeft2]: { x: -10, y: -6 },
      },
      [Gender.Male]: {
        [CharacterFrame.StandingDownRight]: { x: -9, y: -7 },
        [CharacterFrame.StandingUpLeft]: { x: -9, y: -7 },
        [CharacterFrame.WalkingDownRight1]: { x: -8, y: -8 },
        [CharacterFrame.WalkingDownRight2]: { x: -8, y: -8 },
        [CharacterFrame.WalkingDownRight3]: { x: -8, y: -8 },
        [CharacterFrame.WalkingDownRight4]: { x: -8, y: -8 },
        [CharacterFrame.WalkingUpLeft1]: { x: -9, y: -8 },
        [CharacterFrame.WalkingUpLeft2]: { x: -9, y: -8 },
        [CharacterFrame.WalkingUpLeft3]: { x: -9, y: -8 },
        [CharacterFrame.WalkingUpLeft4]: { x: -9, y: -8 },
        [CharacterFrame.MeleeAttackDownRight1]: { x: -7, y: -7 },
        [CharacterFrame.MeleeAttackDownRight2]: { x: -11, y: -7 },
        [CharacterFrame.MeleeAttackUpLeft1]: { x: -7, y: -7 },
        [CharacterFrame.MeleeAttackUpLeft2]: { x: -11, y: -7 },
      },
    },
  };
  return frameTables;
}

/** Weapon-sprite graphic index for a frame: graphicId = (weapon-1)*100 + this.
 *  Returns null for frames where no weapon is drawn (sit/floor/chair), matching
 *  the compositor. Down-right swing frame 2 uses the front graphic (drawn over
 *  the body) so the glow tracks the prominent swing pose. */
export function weaponGraphicIndex(characterFrame: number): number | null {
  if (characterFrame === CharacterFrame.MeleeAttackDownRight2) {
    return WEAPON_FRONT_GRAPHIC;
  }
  return getFrameTables().graphic[characterFrame] ?? null;
}

/** Screen position of the composited weapon's center for a character frame,
 *  derived from the tile-center + frame offset MapRenderer already computed.
 *  Uses NO atlas coordinates (frame.x/frame.y) — those are sub-texture packing
 *  coords, not canvas offsets. */
export function weaponAnchorScreen(
  gender: number,
  characterFrame: number,
  tileCenterX: number,
  tileCenterY: number,
  frameOffsetX: number,
  frameOffsetY: number,
  mirrored: boolean,
): { x: number; y: number } {
  const { offsets } = getFrameTables();
  const table = offsets[gender] ?? offsets[Gender.Male];
  const off = table[characterFrame] ?? table[CharacterFrame.StandingDownRight];
  const x = mirrored
    ? tileCenterX + frameOffsetX - off.x
    : tileCenterX + frameOffsetX + off.x;
  const y = tileCenterY + frameOffsetY + off.y + Y_ANCHOR_OFFSET;
  return { x, y };
}

// Two additive passes stacked for a thick, prominent glow that HUGS the weapon:
//  - core: sharp (unblurred) tinted weapon at the weapon's exact size — the
//    solid body of colour that makes it read as glowing, not faintly tinted.
//  - halo: a barely-larger blurred copy — the soft bloom spilling just past the
//    weapon edges. Its alpha is the core's, scaled by HALO_ALPHA_FRACTION.
// Thickness comes from intensity (alpha) + blur, NOT from scaling the sword up
// (a large scale makes the blade tip jut out and look like a detached sprite).
const CORE_SCALE = 1.0;
const HALO_SCALE = 1.1;
const HALO_ALPHA_FRACTION = 0.9;
const HALO_BLUR_STRENGTH = 2;
const HALO_BLUR_QUALITY = 3;

/** Pooled weapon-shaped glow: tinted additive copies of the weapon sprite (a
 *  sharp core + a blurred halo) laid over the composited weapon. */
export class WeaponElementGlow {
  readonly view: Container;
  private readonly core: Sprite;
  private readonly halo: Sprite;

  constructor() {
    this.view = new Container();
    this.view.eventMode = 'none';
    this.view.label = 'vfx:weapon-glow';

    this.halo = new Sprite();
    this.halo.anchor.set(0.5);
    this.halo.blendMode = 'add';
    this.halo.eventMode = 'none';
    this.halo.scale.set(HALO_SCALE);
    this.halo.filters = [
      new BlurFilter({
        strength: HALO_BLUR_STRENGTH,
        quality: HALO_BLUR_QUALITY,
      }),
    ];

    this.core = new Sprite();
    this.core.anchor.set(0.5);
    this.core.blendMode = 'add';
    this.core.eventMode = 'none';
    this.core.scale.set(CORE_SCALE);

    this.view.addChild(this.halo); // bloom behind
    this.view.addChild(this.core); // solid body in front
  }

  update(
    texture: Texture,
    x: number,
    y: number,
    mirrored: boolean,
    element: CombatElement,
    attackProgress: number | null,
    zIndex: number,
  ): void {
    const cfg = WEAPON_ELEMENT_VFX[element];
    const i = attackProgress === null ? 0 : swingIntensity(attackProgress);
    const alpha = lerp(cfg.idleAlpha, cfg.peakAlpha, i);
    this.core.texture = texture;
    this.halo.texture = texture;
    this.core.tint = cfg.tint;
    this.halo.tint = cfg.tint;
    this.core.alpha = alpha;
    this.halo.alpha = alpha * HALO_ALPHA_FRACTION;
    this.view.x = Math.floor(x);
    this.view.y = Math.floor(y);
    this.view.scale.x = mirrored ? -1 : 1;
    this.view.zIndex = zIndex;
    this.view.visible = true;
  }
}
