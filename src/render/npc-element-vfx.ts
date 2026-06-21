import { BlurFilter, Sprite, type Texture } from 'pixi.js';
import { CombatElement } from '@/combat-overlay/element-colors';
import { elementColorNumber } from './weapon-element-vfx';

// ---------------------------------------------------------------------------
// Procedural Pixi glow for NPCs that carry an element.
//
// Unlike the weapon glow (a small held sprite), an NPC is one whole creature,
// so a full additive tint would wash out its art. Instead the glow is an AURA:
//  - halo: a tinted, blurred copy of the NPC's own frame texture rendered just
//    BEHIND the NPC sprite. The opaque creature covers the centre, so only the
//    blur spilling past the silhouette shows — a colour ring around the outline.
//  - tint: a tinted copy at low alpha rendered just IN FRONT — a subtle wash of
//    element colour over the body, the creature's detail still readable.
// Steady (no flare): NPC attack animations are tick-based with no smooth
// progress, so there's nothing to drive a swing-style ramp.
// ---------------------------------------------------------------------------

interface NpcVfxConfig {
  /** Pixi tint for both passes. */
  tint: number;
  /** Aura (behind) alpha — mostly occluded by the opaque body, only the blur
   *  spill shows, so this rides high. */
  haloAlpha: number;
  /** Light body-tint (front) alpha — kept low so the NPC art stays readable. */
  tintAlpha: number;
}

const HALO_ALPHA = 0.9;
const TINT_ALPHA = 0.18;

/** Per-element config. Shape comes from the NPC sprite; colour differentiates.
 *  Plain never renders. */
const NPC_ELEMENT_VFX: Record<CombatElement, NpcVfxConfig> = {
  [CombatElement.Plain]: { tint: 0xffffff, haloAlpha: 0, tintAlpha: 0 },
  [CombatElement.Fire]: {
    tint: elementColorNumber(CombatElement.Fire),
    haloAlpha: HALO_ALPHA,
    tintAlpha: TINT_ALPHA,
  },
  [CombatElement.Water]: {
    tint: elementColorNumber(CombatElement.Water),
    haloAlpha: HALO_ALPHA,
    tintAlpha: TINT_ALPHA,
  },
  [CombatElement.Earth]: {
    tint: elementColorNumber(CombatElement.Earth),
    haloAlpha: HALO_ALPHA,
    tintAlpha: TINT_ALPHA,
  },
  [CombatElement.Wind]: {
    tint: elementColorNumber(CombatElement.Wind),
    haloAlpha: HALO_ALPHA,
    tintAlpha: TINT_ALPHA,
  },
  [CombatElement.Light]: {
    tint: elementColorNumber(CombatElement.Light),
    haloAlpha: HALO_ALPHA,
    tintAlpha: TINT_ALPHA,
  },
  [CombatElement.Dark]: {
    tint: elementColorNumber(CombatElement.Dark),
    haloAlpha: HALO_ALPHA,
    tintAlpha: TINT_ALPHA,
  },
};

const HALO_BLUR_STRENGTH = 4;
const HALO_BLUR_QUALITY = 3;

/** Pooled NPC aura: a blurred halo (behind) + a light tint (front), both copies
 *  of the NPC's frame texture placed exactly over the NPC sprite. */
export class NpcElementGlow {
  readonly halo: Sprite;
  readonly tint: Sprite;

  constructor() {
    // Default anchor (0,0) + same x/y/scaleX as the NPC sprite → exact overlay.
    this.halo = new Sprite();
    this.halo.blendMode = 'add';
    this.halo.eventMode = 'none';
    this.halo.label = 'vfx:npc-glow-halo';
    this.halo.filters = [
      new BlurFilter({
        strength: HALO_BLUR_STRENGTH,
        quality: HALO_BLUR_QUALITY,
      }),
    ];

    this.tint = new Sprite();
    this.tint.blendMode = 'add';
    this.tint.eventMode = 'none';
    this.tint.label = 'vfx:npc-glow-tint';
  }

  update(
    texture: Texture,
    x: number,
    y: number,
    scaleX: number,
    element: CombatElement,
    haloZ: number,
    tintZ: number,
  ): void {
    const cfg = NPC_ELEMENT_VFX[element];
    this.halo.texture = texture;
    this.tint.texture = texture;
    this.halo.tint = cfg.tint;
    this.tint.tint = cfg.tint;
    this.halo.alpha = cfg.haloAlpha;
    this.tint.alpha = cfg.tintAlpha;
    this.halo.x = x;
    this.halo.y = y;
    this.halo.scale.set(scaleX, 1);
    this.tint.x = x;
    this.tint.y = y;
    this.tint.scale.set(scaleX, 1);
    this.halo.zIndex = haloZ;
    this.tint.zIndex = tintZ;
    this.halo.visible = true;
    this.tint.visible = true;
  }
}
