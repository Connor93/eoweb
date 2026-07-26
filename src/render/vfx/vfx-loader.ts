import { Assets, Graphics, Rectangle, type Renderer, Texture } from 'pixi.js';
import { VFX, type VfxDef } from './vfx-manifest';

export interface ResolvedVfx {
  frames: Texture[];
  durationMs: number;
  additive: boolean;
  scale: number;
}

export class VfxLoader {
  private renderer: Renderer;
  private cache = new Map<string, ResolvedVfx>();

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  // Load every manifest effect (real sheet or procedural placeholder) into the
  // cache so playBurst is synchronous. Call once after Pixi init.
  async preload(): Promise<void> {
    for (const [key, def] of Object.entries(VFX)) {
      this.cache.set(key, await this.build(key, def));
    }
  }

  getFrames(ref: string): ResolvedVfx | null {
    if (!ref) return null;
    return this.cache.get(ref) ?? null;
  }

  private async build(_key: string, def: VfxDef): Promise<ResolvedVfx> {
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
        // fall through to procedural placeholder
      }
    }
    return {
      frames: this.placeholderFrames(def.tint ?? 0xffffff),
      durationMs: def.durationMs ?? 450,
      additive,
      scale,
    };
  }

  // A tinted expanding-then-fading ring, N frames, generated once.
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
