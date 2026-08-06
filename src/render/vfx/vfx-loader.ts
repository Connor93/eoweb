import { Assets, Graphics, Rectangle, type Renderer, Texture } from 'pixi.js';
import {
  buildRegistry,
  type VfxDef as EngineVfxDef,
  effectDurationMs,
  renderFrameCanvas,
} from '@/vfx-engine';
import { SHEETS, type VfxDef } from './vfx-manifest';

export interface ResolvedVfx {
  behind: Texture[]; // empty array when the effect has no such layer
  tint: Texture[]; // empty array when the effect has no such layer
  front: Texture[]; // always non-empty — every kind supplies a front layer
  durationMs: number;
  // Hold time (ms) for ONE discrete step of playback. Each layer array above
  // holds only ONE cycle's worth of textures (Task 3 deliberately rasterizes
  // a single cycle — see renderFrameCanvas's doc comment), so SkillBurst
  // repeats it to fill `durationMs` via
  // `floor(elapsedMs / frameMs) % <layer>.length`. Not derivable from
  // durationMs and frame count alone: frameMs varies per-def (60-100ms; see
  // vfx-engine/registry.ts) and durationMs = frames * loops * frameMs, so
  // without frameMs the loop count is unrecoverable.
  frameMs: number;
  additive: boolean;
  scale: number;
  // Vertical anchor (0..1) sprites should use so the frame's ground point —
  // not its centre — lands on the target. 0.5 for a centred effect
  // (SQUARE_FRAME); a tall descent frame (TALL_FRAME) carries 0.75 so its
  // extra headroom rises above the target instead of pushing the whole
  // sprite down. See FrameGeometry.anchorY in vfx-engine/types.ts.
  anchorY: number;
  // Whether SkillVfxController.playBurst should apply the historic 20px
  // body-centre lift when mounting this burst. Carries FrameGeometry.bodyLift
  // through for procedural defs; the two curated sheets (body-centred by
  // construction) hardcode `true` in both buildSheet return paths below. See
  // FrameGeometry.bodyLift's doc comment in vfx-engine/types.ts for why this
  // is an explicit flag rather than inferred from anchorY.
  bodyLift: boolean;
}

// buildRegistry() allocates all 449 generated defs on every call. They're
// cheap plain objects individually, but getFrames sits on a hot per-cast
// path — build the registry once (module-level, shared across any VfxLoader
// instance) rather than churning it per lookup.
let engineRegistry: Record<string, EngineVfxDef> | null = null;
function getEngineRegistry(): Record<string, EngineVfxDef> {
  if (!engineRegistry) {
    engineRegistry = buildRegistry();
  }
  return engineRegistry;
}

export class VfxLoader {
  private renderer: Renderer;
  private cache = new Map<string, ResolvedVfx>();
  // Guards preload() independently of `cache` — the cache is now shared with
  // lazily-built procedural effects (see getFrames), so `cache.size > 0` no
  // longer implies "sheets are loaded". Stored as the in-flight/settled
  // promise itself (not a boolean) so a concurrent second caller awaits real
  // completion instead of resolving early while the first load is still in
  // flight.
  private preloadPromise: Promise<void> | null = null;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  // Preload only the curated CC0 sheets (SHEETS) so their first playBurst is
  // synchronous. The other 449 vfx-engine effects are NOT preloaded here —
  // rasterizing all of them up front would stall startup for effects most
  // players never trigger. They're built lazily, on demand, in getFrames.
  async preload(): Promise<void> {
    if (!this.preloadPromise) {
      this.preloadPromise = this.loadSheets().catch((err) => {
        // buildSheet already swallows per-sheet load failures (falls back
        // to a placeholder), so this only fires on something unexpected
        // (e.g. a broken renderer). Clear the memo so a later retry is
        // possible instead of wedging the loader "loaded" forever on a
        // failure that never actually populated the sheet cache entries.
        this.preloadPromise = null;
        throw err;
      });
    }
    return this.preloadPromise;
  }

  private async loadSheets(): Promise<void> {
    for (const [key, def] of Object.entries(SHEETS)) {
      this.cache.set(key, await this.buildSheet(def));
    }
  }

  // Synchronous by contract: SkillVfxController.playBurst calls this
  // directly on the hot cast/impact path and must never await. A cache miss
  // on a vfx-engine ref rasterizes its frames right here, synchronously
  // (Canvas2D, not a decode), then caches the result for next time.
  getFrames(ref: string): ResolvedVfx | null {
    if (!ref) return null;

    const cached = this.cache.get(ref);
    if (cached) return cached;

    // Sheets are preloaded async in preload(); a cache miss on a known
    // sheet name means it hasn't finished loading (or failed) yet, not that
    // we should build it here — sheets always win over an engine def of the
    // same name, and we never rasterize a sheet inline.
    // NB `in` walks the prototype chain, so 'constructor'/'toString'/... match
    // here and return early. That is harmless — those refs are not in the
    // engine registry either (it is Object.create(null); see buildRegistry),
    // so both paths yield the same "no effect" result for every such ref.
    if (ref in SHEETS) return null;

    const def = getEngineRegistry()[ref];
    if (!def) return null;

    const resolved = this.buildProcedural(def);
    this.cache.set(ref, resolved);
    return resolved;
  }

  // Rasterizes every frame of a vfx-engine def via Canvas2D and wraps each
  // canvas in a Pixi texture. Synchronous — Texture.from(HTMLCanvasElement)
  // is valid and synchronous in Pixi v8 (ImageResource covers canvases).
  //
  // `skipCache: true` keeps these out of Pixi's global Assets `Cache`. That
  // cache is keyed for shared, named assets; a procedural texture is owned
  // solely by this loader's own `cache`, and letting Pixi also retain it
  // would pin the source HTMLCanvasElement for the session on top of the
  // GPU texture — double retention for zero reuse.
  private buildProcedural(def: EngineVfxDef): ResolvedVfx {
    const behind: Texture[] = [];
    const tint: Texture[] = [];
    const front: Texture[] = [];
    for (let i = 0; i < def.frames; i++) {
      // renderFrameCanvas returns a three-layer { behind?, tint?, front }
      // object — front is always present; behind/tint are present only when
      // the kind (or its combo) actually paints something there, and that
      // presence is constant across every frame of a given def (it's decided
      // by KINDS[def.kind].draw, not by frameIndex), so behind/tint end up
      // either empty or exactly `def.frames` long, same as front.
      const layers = renderFrameCanvas(def, i);
      front.push(Texture.from(layers.front, true));
      if (layers.behind) behind.push(Texture.from(layers.behind, true));
      if (layers.tint) tint.push(Texture.from(layers.tint, true));
    }
    return {
      behind,
      tint,
      front,
      // See the `frameMs` field doc on the ResolvedVfx interface above for
      // how this (total playback time across all `loops`) relates to the
      // per-cycle texture arrays above and frameMs below.
      durationMs: effectDurationMs(def),
      frameMs: def.frameMs,
      additive: def.additive,
      // NOT def.sizeScale. The engine has already baked sizeScale into every
      // radius/length while rasterizing these frames (drawEffectAt ->
      // KINDS[kind].draw), so a `-lg` def's pixels are ALREADY 1.5x. Passing
      // sizeScale on to SkillBurst's sprite.scale.set() would apply it a
      // second time (0.36x / 2.25x instead of 0.6x / 1.5x) and diverge from
      // the aio-editor preview, which draws the same frames unscaled.
      // `ResolvedVfx.scale` is the *sprite-sheet* multiplier — see the sheet
      // path below, where it comes from the manifest.
      scale: 1,
      anchorY: def.frame.anchorY,
      bodyLift: def.frame.bodyLift,
    };
  }

  private async buildSheet(def: VfxDef): Promise<ResolvedVfx> {
    const additive = def.additive ?? true;
    const scale = def.scale ?? 1;
    if (
      def.sheet &&
      def.frameWidth &&
      def.frameHeight &&
      def.frames &&
      def.fps
    ) {
      try {
        const base = await Assets.load<Texture>(`/vfx/${def.sheet}`);
        const front: Texture[] = [];
        for (let i = 0; i < def.frames; i++) {
          front.push(
            new Texture({
              source: base.source,
              frame: new Rectangle(
                i * def.frameWidth,
                0,
                def.frameWidth,
                def.frameHeight,
              ),
            }),
          );
        }
        // Sheets play through once (no separate loop count), so `frames` IS
        // the total step count and frameMs is just the per-frame hold time
        // implied by fps.
        return {
          behind: [],
          tint: [],
          front,
          durationMs: (def.frames / def.fps) * 1000,
          frameMs: 1000 / def.fps,
          additive,
          scale,
          // Sheets bypass the procedural pipeline entirely — no VfxDef, no
          // frame, so no def.frame.anchorY to reach for. They're square and
          // centred by construction; hardcode the value the sprites already
          // used before ResolvedVfx.anchorY existed.
          anchorY: 0.5,
          // Both curated sheets (cast-burst, fire-impact) are body-centred
          // art; they must keep the lift regardless of which return path
          // resolves them, or a load failure would silently move an effect
          // 20px on the one path nobody exercises in normal testing.
          bodyLift: true,
        };
      } catch {
        // fall through to placeholder
      }
    }
    const front = this.placeholderFrames(def.tint ?? 0xffffff);
    const durationMs = def.durationMs ?? 450;
    return {
      behind: [],
      tint: [],
      front,
      durationMs,
      frameMs: durationMs / front.length,
      additive,
      scale,
      anchorY: 0.5,
      // See the loaded-sheet path above: same body-centred sheets, same
      // lift, on the Assets.load-failure fallback.
      bodyLift: true,
    };
  }

  // A tinted expanding-then-fading ring, N frames, generated once. Fallback
  // for a curated sheet whose Assets.load rejects.
  private placeholderFrames(tint: number): Texture[] {
    const size = 64;
    const count = 8;
    const out: Texture[] = [];
    for (let i = 0; i < count; i++) {
      const p = i / (count - 1);
      const g = new Graphics()
        .circle(size / 2, size / 2, 3 + p * (size / 2 - 5))
        .stroke({ width: 3, color: tint, alpha: 1 - p });
      out.push(this.renderer.generateTexture({ target: g }));
      g.destroy();
    }
    return out;
  }
}
