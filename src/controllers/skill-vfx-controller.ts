import type { Client } from '@/client';
import { SkillBurst, type VfxLoader } from '@/render';

// Vertical offset (px) applied ONLY to a centred (SQUARE_FRAME, anchorY 0.5)
// burst, so it mounts near the body centre rather than the feet — the look
// every effect had before FrameGeometry existed. A frame carrying its own
// ground point (TALL_FRAME, anchorY 0.75) must land ON the ground instead:
// applying this lift there would float a descent's impact 20px above the
// target's feet, fighting the very anchor the frame was built to express.
// Call sites (skill.ts) pass the raw sprite position; this is the ONLY place
// the lift is applied — see playBurst below.
const BURST_UP = 20;

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

  // `targetKey` sandwiches the burst's behind/tint/front layers around the
  // target's own current paint order (see MapRenderer.getEntityZIndex) —
  // pass null when the caller has no target to key off of (e.g. a
  // ground-targeted effect), and SkillBurst falls back to a flat z.
  //
  // Unlike a one-off zIndex, the key itself is stored on the burst
  // (SkillBurst.targetKey) and re-resolved every frame in advance() below,
  // so the sandwich keeps tracking the target for the burst's whole life
  // instead of going stale the moment the target's paint order shifts.
  // That shift isn't rare: map.ts reassigns zIndex 0..N across the whole
  // viewport-clipped tile+entity band every frame, so ANY change in sprite
  // count ahead of the target moves its ordinal — including the player's
  // own movement, which re-clips the static tile band on every step.
  playBurst(ref: string, x: number, y: number, targetKey: string | null): void {
    const resolved = this.loader.getFrames(ref);
    if (!resolved) return;
    // A centred frame (anchorY 0.5) is authored as a blob around the body,
    // so it keeps the historic body-centre lift. A frame carrying its own
    // ground point (TALL_FRAME, anchorY 0.75) must land ON the ground — no
    // lift. See BURST_UP's doc comment above.
    const yy = resolved.anchorY === 0.5 ? y - BURST_UP : y;
    const targetZIndex = targetKey
      ? (this.client.mapRenderer?.getEntityZIndex(targetKey) ?? null)
      : null;
    const burst = this.pool.pop() ?? new SkillBurst();
    burst.reset(resolved, x, yy, targetZIndex, targetKey);
    burst.mount(this.client.worldContainer);
    this.active.push(burst);
  }

  advance(deltaMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      // Re-derive the target's zIndex fresh every frame (one Map lookup per
      // active burst) instead of trusting the value snapshotted at cast
      // time — see playBurst's comment above. A null result (e.g. the
      // target despawned mid-effect) is left alone: the sprites keep
      // whatever zIndex they last had rather than snapping to 0 and sinking
      // to the bottom of the world.
      if (b.targetKey) {
        const z = this.client.mapRenderer?.getEntityZIndex(b.targetKey);
        if (z !== null && z !== undefined) b.updateZIndex(z);
      }
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
