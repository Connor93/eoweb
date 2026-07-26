import type { Client } from '@/client';
import { SkillBurst, type VfxLoader } from '@/render';

// Fire-and-forget one-shot skill bursts mounted in worldContainer. Pooled.
export class SkillVfxController {
  private client: Client;
  private loader: VfxLoader;
  private active: SkillBurst[] = [];
  private pool: SkillBurst[] = [];

  constructor(client: Client, loader: VfxLoader) {
    this.client = client;
    this.loader = loader;
  }

  playBurst(ref: string, x: number, y: number): void {
    const resolved = this.loader.getFrames(ref);
    if (!resolved) return;
    const burst = this.pool.pop() ?? new SkillBurst();
    burst.reset(
      resolved.frames,
      resolved.durationMs,
      x,
      y,
      resolved.additive,
      resolved.scale,
    );
    burst.mount(this.client.worldContainer);
    this.active.push(burst);
  }

  advance(deltaMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.step(deltaMs);
      if (b.finished) {
        b.unmount();
        this.active.splice(i, 1);
        this.pool.push(b);
      }
    }
  }

  clear(): void {
    for (const b of this.active) b.unmount();
    this.pool.push(...this.active);
    this.active = [];
  }
}
