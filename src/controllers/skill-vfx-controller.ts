import type { Client } from '@/client';
import { SkillBurst, type VfxLoader } from '@/render';

// Vertical offset (px) applied ONLY to a burst whose ResolvedVfx.bodyLift is
// true, so it mounts near the body centre rather than the feet — the look
// every effect had before FrameGeometry existed. A frame carrying its own
// meaningful ground point (TALL_FRAME) or an effect that belongs on the
// floor (GROUND_FRAME) must land ON the ground instead: applying this lift
// there would float it above the target's feet, fighting the very anchor the
// frame was built to express.
//
// This used to be inferred as `anchorY === 0.5`, which is why ring-of-fire
// floated at chest height: it uses a square frame, so its anchorY is exactly
// 0.5 too, and it silently inherited a rule meant for body-centred blobs.
// bodyLift is now an explicit flag on the frame (see FrameGeometry.bodyLift
// in vfx-engine/types.ts) instead of something inferred from geometry that
// happens to coincide for the wrong reason.
//
// Call sites (skill.ts) pass the raw sprite position; this file is the ONLY
// place the lift is applied — via liftY below, which both playBurst (at cast
// time) and advance (on every position refresh) go through so the two can't
// drift apart.
const BURST_UP = 20;

// The lift itself, in one place. Applied at cast time by playBurst and again
// on every per-frame position refresh in advance — if only one of the two
// applied it, the burst would visibly jump 20px on its second frame.
function liftY(y: number, bodyLift: boolean): number {
  return bodyLift ? y - BURST_UP : y;
}

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
    // See BURST_UP's doc comment above: bodyLift is an explicit per-effect
    // flag, not inferred from anchorY.
    const yy = liftY(y, resolved.bodyLift);
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
        // Re-derive position for the same reason, and with the same null
        // handling — but where a stale zIndex is merely a paint-order glitch, a
        // stale position is a visible bug: worldContainer coordinates are
        // camera-baked, so a burst left at its cast-time position drifts across
        // the screen with the camera instead of staying on its target. See
        // SkillBurst.updatePosition. A null result (target despawned mid-effect,
        // e.g. an NPC whose death animation has already cleared its sprite)
        // leaves the burst where it last was, so an impact effect still plays
        // out over the corpse rather than snapping to the viewport origin.
        const pos = this.client.mapRenderer?.getEntityWorldSpritePosition(
          b.targetKey,
        );
        if (pos) b.updatePosition(pos.x, liftY(pos.y, b.bodyLift));
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
