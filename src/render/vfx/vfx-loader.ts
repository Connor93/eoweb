import { Assets, Graphics, Rectangle, type Renderer, Texture } from 'pixi.js';
import {
  buildRegistry,
  type VfxDef as EngineVfxDef,
  renderFrameCanvas,
} from '@/vfx-engine';
import { SHEETS, type VfxDef } from './vfx-manifest';

export interface ResolvedVfx {
  frames: Texture[];
  durationMs: number;
  additive: boolean;
  scale: number;
}

// buildRegistry() allocates all 379 generated defs on every call. They're
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
  // synchronous. The other 379 vfx-engine effects are NOT preloaded here —
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
  private buildProcedural(def: EngineVfxDef): ResolvedVfx {
    const frames: Texture[] = [];
    for (let i = 0; i < def.frames; i++) {
      frames.push(Texture.from(renderFrameCanvas(def, i)));
    }
    return {
      frames,
      durationMs: def.durationMs,
      additive: def.additive,
      scale: def.sizeScale,
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
        const frames: Texture[] = [];
        for (let i = 0; i < def.frames; i++) {
          frames.push(
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
        return {
          frames,
          durationMs: (def.frames / def.fps) * 1000,
          additive,
          scale,
        };
      } catch {
        // fall through to placeholder
      }
    }
    return {
      frames: this.placeholderFrames(def.tint ?? 0xffffff),
      durationMs: def.durationMs ?? 450,
      additive,
      scale,
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
