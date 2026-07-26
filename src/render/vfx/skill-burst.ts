import { type Container, Sprite, type Texture } from 'pixi.js';
import { TimedAnimation } from '@/render';

// A one-shot sprite-sheet burst: steps `frames` over `durationMs`, then finished.
export class SkillBurst extends TimedAnimation {
  readonly sprite: Sprite;
  private frames: Texture[] = [];

  constructor() {
    super(1);
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
  }

  reset(
    frames: Texture[],
    durationMs: number,
    x: number,
    y: number,
    additive: boolean,
    scale: number,
  ): void {
    this.frames = frames;
    this.durationMs = Math.max(1, durationMs);
    this.elapsedMs = 0;
    this.renderedFirstFrame = true; // advance immediately (frame 0 shows this frame)
    this.sprite.texture = frames[0];
    this.sprite.x = Math.floor(x);
    this.sprite.y = Math.floor(y);
    this.sprite.blendMode = additive ? 'add' : 'normal';
    this.sprite.scale.set(scale);
    this.sprite.visible = true;
  }

  step(deltaMs: number): void {
    this.advance(deltaMs);
    const idx = Math.min(
      this.frames.length - 1,
      Math.floor(this.progress * this.frames.length),
    );
    this.sprite.texture = this.frames[idx];
  }

  mount(container: Container): void {
    container.addChild(this.sprite);
  }
  unmount(): void {
    this.sprite.visible = false;
    this.sprite.parent?.removeChild(this.sprite);
  }
}
