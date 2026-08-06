import { type Container, Sprite, type Texture } from 'pixi.js';
import { TimedAnimation } from '@/render';
import type { ResolvedVfx } from './vfx-loader';

// worldContainer is sortableChildren; every map/entity/effect sprite is re-assigned
// zIndex 0..N from `_worldOrder` each frame (MapRenderer.beginFrame resets it to 0).
// A burst is added once and NOT part of that sweep, so it needs an explicit zIndex
// or it sits at 0 and renders BEHIND the whole world (invisible). That zIndex is
// derived from the target's own current zIndex (see reset()/updateZIndex() below,
// and SkillVfxController.advance, which re-derives it every frame rather than
// trusting the value snapshotted at cast time — the target's ordinal shifts
// whenever the sprite count ahead of it changes, which the player's OWN movement
// causes just as much as the target's, by re-clipping the viewport's static tile
// band) so the three layers keep sandwiching the character correctly for the
// burst's whole life. This constant is only the fallback for the rare case a
// target has no live world sprite to key off of at all (e.g. it despawned between
// the packet that triggered the cast and this call, or hasn't been rendered yet
// this frame). Falling back still parks the burst well above the per-frame
// world-sprite range so it draws on top rather than vanishing.
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
  // Entity key to re-derive this burst's zIndex from every frame (see
  // updateZIndex below), or null for a ground-targeted effect with no
  // entity to track. Public so SkillVfxController.advance can read it
  // without a getter — set only from reset().
  targetKey: string | null = null;
  // This effect's ResolvedVfx.bodyLift, carried here so that advance()'s
  // per-frame position refresh can re-apply the same vertical lift playBurst
  // applied at cast time. Without it the burst would jump down by BURST_UP on
  // its second frame. Public for the same reason as targetKey.
  bodyLift = false;

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
    targetKey: string | null,
  ): void {
    this.durationMs = Math.max(1, resolved.durationMs);
    this.frameMs = Math.max(1, resolved.frameMs);
    this.elapsedMs = 0;
    this.renderedFirstFrame = true; // advance immediately (frame 0 shows this frame)
    // Stored so SkillVfxController.advance can re-derive the sandwich zIndex
    // every frame via updateZIndex below, instead of it staying pinned to
    // whatever zIndex the target happened to have at cast time. Null (a
    // ground-targeted effect) means updateZIndex is never called and the
    // fallback z below holds for the burst's whole life.
    this.targetKey = targetKey;
    this.bodyLift = resolved.bodyLift;

    // All three depth sprites are the same frame, so they share one anchor.
    // 0.5 for a centred effect (SQUARE_FRAME); a tall descent frame carries
    // resolved.anchorY = 0.75 so the frame's ground point — not its centre —
    // lands on (x, y). See ResolvedVfx.anchorY's doc comment.
    for (const layer of this.layers) {
      layer.sprite.anchor.set(0.5, resolved.anchorY);
    }

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

  // Re-applies the behind/tint/front sandwich around a freshly-read target
  // zIndex — called every frame by SkillVfxController.advance (only when
  // `targetKey` is set) so the burst tracks the target's live paint order
  // for its whole life instead of the value snapshotted once in reset().
  // Mirrors reset()'s z-1/z+1/z+2 offsets but touches only zIndex, not
  // texture/position/scale/blendMode, so it's cheap to call unconditionally
  // every frame for every active burst.
  updateZIndex(z: number): void {
    this.behind.sprite.zIndex = z - 1;
    this.tint.sprite.zIndex = z + 1;
    this.front.sprite.zIndex = z + 2;
  }

  // Moves all three layers to a freshly-read position — called every frame by
  // SkillVfxController.advance for the same reason updateZIndex is.
  //
  // This is NOT an optional refinement. worldContainer coordinates are
  // *camera-baked*: MapRenderer.getEntityWorldSpritePosition returns
  // `iso - lastPlayerScreen + halfViewport`, which is only valid for the frame
  // it was computed in. A position snapshotted at cast time and left alone is
  // therefore pinned to a point on the SCREEN, so once the camera moves the
  // burst slides along with it instead of staying on its target — the whole
  // effect appears to follow the player around. Re-deriving from the target's
  // key every frame is what makes the burst track the entity it was cast on,
  // for a walking player and a walking NPC alike.
  //
  // Set unconditionally on all three sprites, including any layer with no
  // frames (invisible, so its coordinates are inert) — keeping them in lockstep
  // is cheaper than branching and avoids a stale layer surfacing later.
  updatePosition(x: number, y: number): void {
    const px = Math.floor(x);
    const py = Math.floor(y);
    for (const layer of this.layers) {
      layer.sprite.x = px;
      layer.sprite.y = py;
    }
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
