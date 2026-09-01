import { type Container, Sprite, type Texture } from 'pixi.js';
import { moteAlpha } from '@/vfx-engine';

/** One trail mote. Pooled by ProjectileController.
 *
 *  Like Projectile, it stores its position in RAW iso space and is baked to
 *  worldContainer coords by the controller EVERY frame — a stored bake would
 *  pin it to the screen and it would drift with the camera. */
export class TrailParticle {
  readonly sprite: Sprite;
  /** Birth point in RAW iso space. */
  isoX = 0;
  isoY = 0;
  /** Per-ms drift in screen space. */
  driftX = 0;
  driftY = 0;
  ageMs = 0;
  lifeMs = 1;

  constructor() {
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
  }

  reset(
    texture: Texture,
    isoX: number,
    isoY: number,
    driftX: number,
    driftY: number,
    lifeMs: number,
  ): void {
    this.sprite.texture = texture;
    this.isoX = isoX;
    this.isoY = isoY;
    this.driftX = driftX;
    this.driftY = driftY;
    this.ageMs = 0;
    this.lifeMs = Math.max(1, lifeMs);
    this.sprite.alpha = 1;
    this.sprite.visible = true;
  }

  step(deltaMs: number): void {
    this.ageMs = Math.min(this.ageMs + deltaMs, this.lifeMs);
  }

  get finished(): boolean {
    return this.ageMs >= this.lifeMs;
  }

  /** Fades out over its life, easing so it lingers then goes quickly. Curve
   *  lives in vfx-engine/arrows.ts (moteAlpha) so this and the AIO editor's
   *  preview can never drift apart. */
  get alpha(): number {
    const t = this.ageMs / this.lifeMs;
    return moteAlpha(t);
  }

  /** Current point in RAW iso space: birth plus accumulated drift. */
  currentIso(): { x: number; y: number } {
    return {
      x: this.isoX + this.driftX * this.ageMs,
      y: this.isoY + this.driftY * this.ageMs,
    };
  }

  mount(container: Container): void {
    container.addChild(this.sprite);
  }

  unmount(): void {
    this.sprite.visible = false;
    this.sprite.parent?.removeChild(this.sprite);
  }
}
