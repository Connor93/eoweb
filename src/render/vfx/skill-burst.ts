import { type Container, Sprite, type Texture } from 'pixi.js';
import { TimedAnimation } from '@/render';
import type { ResolvedVfx } from './vfx-loader';

// worldContainer is sortableChildren; every map/entity/effect sprite is re-assigned
// zIndex 0..N from `_worldOrder` each frame (MapRenderer.beginFrame resets it to 0).
// A burst is added once and NOT part of that sweep, so it needs an explicit zIndex
// or it sits at 0 and renders BEHIND the whole world (invisible). Ordinarily that
// zIndex is derived from the target's own current zIndex (see reset() below) so the
// three layers sandwich the character correctly; this constant is only the fallback
// for the rare case a target has no live world sprite to key off of (e.g. it
// despawned between the packet that triggered the cast and this call, or the
// character-ghost render pass, which doesn't register a `character:*:main` sprite).
// Falling back still parks the burst well above the per-frame world-sprite range so
// it draws on top rather than vanishing.
const BURST_Z_INDEX_FALLBACK = 1_000_000;

/** One depth layer of a burst: its own sprite plus the (single-cycle) frames it
 *  loops through. `frames` is empty when the effect has no content for this layer —
 *  the sprite stays permanently invisible for the burst's lifetime in that case. */
interface BurstLayer {
  readonly sprite: Sprite;
  frames: Texture[];
}

function makeLayerSprite(): Sprite {
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.visible = false;
  return sprite;
}

// A one-shot, three-layer sprite stack: `behind`/`tint`/`front` all step through
// their (single-cycle) frames together over `durationMs`, repeating the cycle as
// needed, then finished. Mirrors the depth axis vfx-engine paints into — 'behind'
// composites under the target character, 'tint' blends onto it (additive), 'front'
// composites over it, same as the aio-editor's live preview.
export class SkillBurst extends TimedAnimation {
  private readonly behind: BurstLayer = {
    sprite: makeLayerSprite(),
    frames: [],
  };
  private readonly tint: BurstLayer = { sprite: makeLayerSprite(), frames: [] };
  private readonly front: BurstLayer = {
    sprite: makeLayerSprite(),
    frames: [],
  };
  private readonly layers: readonly BurstLayer[] = [
    this.behind,
    this.tint,
    this.front,
  ];
  // Hold time (ms) per discrete playback step, from ResolvedVfx.frameMs.
  private frameMs = 100;

  constructor() {
    super(1);
    // Load-bearing, not cosmetic: the engine quantises every painted pixel onto a
    // 4-rung ramp at FULL alpha (see vfx-engine/render.ts's quantizeToRamp), so a
    // tint layer composited `normal` would resolve to an opaque patch sitting on
    // top of the character instead of a glow. `add` is what keeps a dark wash
    // (shadow-rung luminance) reading as "barely brightens anything" per
    // drawRingTint's comment in vfx-engine/kinds.ts. This is fixed for every
    // effect, unlike behind/front, which follow the effect's own `additive` flag.
    this.tint.sprite.blendMode = 'add';
  }

  reset(
    resolved: ResolvedVfx,
    x: number,
    y: number,
    targetZIndex: number | null,
  ): void {
    this.durationMs = Math.max(1, resolved.durationMs);
    this.frameMs = Math.max(1, resolved.frameMs);
    this.elapsedMs = 0;
    this.renderedFirstFrame = true; // advance immediately (frame 0 shows this frame)

    const z = targetZIndex ?? BURST_Z_INDEX_FALLBACK;
    const blendMode = resolved.additive ? 'add' : 'normal';
    this.armLayer(
      this.behind,
      resolved.behind,
      x,
      y,
      z - 1,
      blendMode,
      resolved.scale,
    );
    // tint's blendMode is fixed to 'add' in the constructor regardless of
    // resolved.additive — see the comment there.
    this.armLayer(this.tint, resolved.tint, x, y, z + 1, 'add', resolved.scale);
    this.armLayer(
      this.front,
      resolved.front,
      x,
      y,
      z + 2,
      blendMode,
      resolved.scale,
    );
  }

  private armLayer(
    layer: BurstLayer,
    frames: Texture[],
    x: number,
    y: number,
    zIndex: number,
    blendMode: 'add' | 'normal',
    scale: number,
  ): void {
    layer.frames = frames;
    const sprite = layer.sprite;
    sprite.visible = frames.length > 0;
    if (frames.length === 0) return;
    sprite.texture = frames[0] as Texture;
    sprite.x = Math.floor(x);
    sprite.y = Math.floor(y);
    sprite.blendMode = blendMode;
    sprite.scale.set(scale);
    sprite.zIndex = zIndex;
  }

  step(deltaMs: number): void {
    this.advance(deltaMs);
    // Repeats the rasterized single cycle rather than stretching it across the
    // full (frames * loops * frameMs) duration: each layer's `frames` holds one
    // cycle's textures, so wrapping the absolute step index by that layer's own
    // length is what makes e.g. a 4-frame/3-loop effect visibly play 4 frames,
    // three times, instead of playing once at a third of the speed.
    const stepIndex = Math.floor(this.elapsedMs / this.frameMs);
    for (const layer of this.layers) {
      if (layer.frames.length === 0) continue;
      layer.sprite.texture = layer.frames[
        stepIndex % layer.frames.length
      ] as Texture;
    }
  }

  mount(container: Container): void {
    for (const layer of this.layers) container.addChild(layer.sprite);
  }

  unmount(): void {
    for (const layer of this.layers) {
      layer.sprite.visible = false;
      layer.sprite.parent?.removeChild(layer.sprite);
    }
  }
}
