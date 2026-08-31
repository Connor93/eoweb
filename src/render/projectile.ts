import { type Container, Sprite, type Texture } from 'pixi.js';

// worldContainer is sortableChildren; every map/entity/effect sprite is
// re-assigned zIndex 0..N from `_worldOrder` each frame (MapRenderer.
// beginFrame resets it to 0). A projectile is never touched by that
// per-frame sweep, and it never gets a target-derived zIndex either — every
// projectile, homing or targetless, keeps this flat fallback for its whole
// flight (see ProjectileController.advanceActive). Without an explicit
// default it would sit at Pixi's default zIndex 0 and render BEHIND the
// entire world — invisible. Mirrors SkillBurst's BURST_Z_INDEX_FALLBACK
// (src/render/vfx/skill-burst.ts): parks the sprite well above the
// per-frame world-sprite range so it draws on top rather than vanishing —
// an arrow in flight is a foreground element, same as a one-shot VFX.
const PROJECTILE_Z_INDEX_FALLBACK = 1_000_000;

/** A projectile's appearance. The controller never knows what it is flying:
 *  the arrow supplies static per-facing textures, and a future spell
 *  projectile supplies animated vfx-engine frames through the same interface.
 *
 *  `dx`/`dy` are the travel vector in SCREEN space, not tile space, so a
 *  visual picks its facing from where it is actually going rather than from
 *  the Direction enum. `progress` is 0..1 through the flight, for visuals
 *  that animate. */
export interface ProjectileVisual {
  textureFor(dx: number, dy: number, progress: number): Texture | null;
}

/** One in-flight projectile. Pooled by ProjectileController.
 *
 *  Position is interpolated in RAW iso-screen space and baked to
 *  worldContainer coords by the controller EVERY frame — see
 *  MapRenderer.bakeIsoToWorldSprite. Storing a baked position would pin the
 *  sprite to the screen and make it drift with the camera. */
export class Projectile {
  readonly sprite: Sprite;
  visual: ProjectileVisual | null = null;
  /** The player who fired this shot. Lets the controller retarget an
   *  in-flight, still-targetless projectile when a delayed outcome packet
   *  arrives after launch — see ProjectileController.attachOutcome. */
  shooterId = 0;
  /** Launch point in RAW iso-screen space. Fixed for the whole flight. */
  fromIsoX = 0;
  fromIsoY = 0;
  /** Impact point in RAW iso-screen space. Refreshed every frame while the
   *  target still resolves (homing); the last value stands once it doesn't. */
  toIsoX = 0;
  toIsoY = 0;
  /** Entity key to home on ("npc:42" / "char:1024"), or null for a targetless
   *  shot flying to a fixed point to fizzle. */
  targetKey: string | null = null;
  durationMs = 1;
  elapsedMs = 0;
  /** Released on impact. Nulled after firing so it can never run twice. */
  onImpact: (() => void) | null = null;

  constructor() {
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
  }

  reset(
    visual: ProjectileVisual,
    shooterId: number,
    fromIsoX: number,
    fromIsoY: number,
    toIsoX: number,
    toIsoY: number,
    targetKey: string | null,
    durationMs: number,
    onImpact: (() => void) | null,
  ): void {
    this.visual = visual;
    this.shooterId = shooterId;
    this.fromIsoX = fromIsoX;
    this.fromIsoY = fromIsoY;
    this.toIsoX = toIsoX;
    this.toIsoY = toIsoY;
    this.targetKey = targetKey;
    this.durationMs = Math.max(1, durationMs);
    this.elapsedMs = 0;
    this.onImpact = onImpact;
    this.sprite.visible = true;
    // Every reset applies the fallback, so a projectile pulled from the pool
    // can never inherit the previous flight's zIndex either. Nothing
    // overwrites this afterwards — see PROJECTILE_Z_INDEX_FALLBACK above.
    this.updateZIndex(PROJECTILE_Z_INDEX_FALLBACK);
  }

  get progress(): number {
    return Math.min(this.elapsedMs / this.durationMs, 1);
  }

  get finished(): boolean {
    return this.elapsedMs >= this.durationMs;
  }

  step(deltaMs: number): void {
    this.elapsedMs = Math.min(this.elapsedMs + deltaMs, this.durationMs);
  }

  /** Current point in RAW iso-screen space. */
  currentIso(): { x: number; y: number } {
    const t = this.progress;
    return {
      x: this.fromIsoX + (this.toIsoX - this.fromIsoX) * t,
      y: this.fromIsoY + (this.toIsoY - this.fromIsoY) * t,
    };
  }

  /** End the flight here and now, wherever the projectile currently is. The
   *  next controller pass sees `finished` and releases the impact bundle at
   *  this point. Used by the safety valve in Task 5. */
  collapse(): void {
    const now = this.currentIso();
    this.toIsoX = now.x;
    this.toIsoY = now.y;
    this.targetKey = null;
    this.elapsedMs = this.durationMs;
  }

  /** Fire and clear the impact bundle. Safe to call more than once. */
  releaseImpact(): void {
    const fn = this.onImpact;
    this.onImpact = null;
    fn?.();
  }

  refreshTexture(): void {
    if (!this.visual) return;
    const texture = this.visual.textureFor(
      this.toIsoX - this.fromIsoX,
      this.toIsoY - this.fromIsoY,
      this.progress,
    );
    if (texture && this.sprite.texture !== texture) {
      this.sprite.texture = texture;
    }
  }

  updatePosition(x: number, y: number): void {
    this.sprite.position.set(x, y);
  }

  updateZIndex(z: number): void {
    this.sprite.zIndex = z;
  }

  mount(container: Container): void {
    container.addChild(this.sprite);
  }

  unmount(): void {
    this.sprite.visible = false;
    this.sprite.parent?.removeChild(this.sprite);
  }
}
