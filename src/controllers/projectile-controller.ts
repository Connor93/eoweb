import type { Client } from '@/client';
import type { CombatElement } from '@/combat-overlay/element-colors';
import { HALF_TILE_HEIGHT, HALF_TILE_WIDTH } from '@/consts';
import { getArrowVisual, Projectile } from '@/render';
import { isoToScreen, localAttackRayTiles } from '@/utils';

// --- Tuning knobs. The first three are settled in the browser, not on paper. ---

/** Fraction of the attack animation that passes before the arrow leaves the
 *  bow. The ranged pose is a SINGLE held frame for the whole attackMs
 *  (map.ts, CharacterRangedAttackAnimation), so the release moment is ours to
 *  pick: a short delay reads as "aimed, then loosed" instead of an instant
 *  spit. This is also the deadline by which a shot must have found its
 *  target — see attachOutcome. */
const RELEASE_FRACTION = 0.25;
/** Constant flight speed, so travel time scales with distance — a long shot
 *  visibly takes longer, which is the entire point of drawing the arrow. */
const ARROW_TILES_PER_SEC = 15;
/** Floor so a 1-tile shot still reads as a shot rather than a pop. */
const MIN_FLIGHT_MS = 80;
/** Height above the tile centre that projectiles fly at, so they cross at
 *  body level instead of skimming the floor. */
const FLIGHT_LIFT = 18;
/** How far forward of the shooter the arrow starts, along the firing line, so
 *  it leaves the bow instead of appearing inside the character sprite. About
 *  40% of a tile — clear of the body without looking detached from it. */
const MUZZLE_OFFSET = 14;

/** One tile of travel, in iso-screen pixels. */
const TILE_ISO_PX = Math.hypot(HALF_TILE_WIDTH, HALF_TILE_HEIGHT);

/** A shot whose arrow has not left the bow yet. Held for RELEASE_FRACTION of
 *  the attack animation so the damage packet — sent in the SAME server tick
 *  as the swing — has arrived and named the target before launch. */
interface PendingShot {
  playerId: number;
  element: CombatElement;
  releaseInMs: number;
  targetKey: string | null;
  onImpact: (() => void) | null;
}

/** In-flight projectiles + the pending shots that will become them. Pooled
 *  and mounted in worldContainer, modelled on SkillVfxController. */
export class ProjectileController {
  private client: Client;
  private active: Projectile[] = [];
  private pool: Projectile[] = [];
  /** FIFO per shooter. A fast bow at long range can have several shots out,
   *  and each outcome packet must attach to the shot that caused it, in
   *  order — hence a queue, not a single slot. */
  private pending = new Map<number, PendingShot[]>();

  constructor(client: Client) {
    this.client = client;
  }

  /** A ranged swing was seen. Opens a pending shot; the arrow launches
   *  RELEASE_FRACTION of the way through the animation. */
  openShot(playerId: number, attackMs: number, element: CombatElement): void {
    const queue = this.pending.get(playerId) ?? [];
    queue.push({
      playerId,
      element,
      releaseInMs: Math.max(1, attackMs * RELEASE_FRACTION),
      targetKey: null,
      onImpact: null,
    });
    this.pending.set(playerId, queue);
  }

  /** Attach a target + its deferred impact bundle to this shooter's oldest
   *  unattached pending shot — or, failing that, to their oldest in-flight
   *  targetless projectile.
   *
   *  The fallback exists for the LOCAL player only. openShot for another
   *  player fires from handlers/attack.ts when their Attack packet arrives,
   *  in the same server tick as the outcome packet, so the pending-queue
   *  match above always finds it. But the local player's shot is opened at
   *  INPUT time (keyboard-controller.ts) and launches RELEASE_FRACTION into
   *  the attack animation — well under a server round trip on any real
   *  connection. So by the time the outcome packet lands, the shot has
   *  usually already launched and left the pending queue. Without this
   *  fallback the bundle would apply immediately here, right as a
   *  still-targetless arrow is flying past the target — the exact bug this
   *  whole feature exists to fix, reappearing under latency.
   *
   *  advanceActive re-reads the endpoint from targetKey every frame
   *  (homing), so setting targetKey on an in-flight projectile is enough to
   *  steer it onto the target for the rest of its flight — no need to touch
   *  duration or endpoints here.
   *
   *  Returns true when it attached — the caller must then NOT apply the
   *  bundle itself; the projectile will release it on impact. Returns false
   *  when neither a pending nor an active shot matched (a melee attack, or a
   *  shot opened before this client was watching), and the caller applies
   *  immediately as before. */
  attachOutcome(
    playerId: number,
    targetKey: string,
    onImpact: () => void,
  ): boolean {
    const queue = this.pending.get(playerId);
    const shot = queue?.find((s) => s.targetKey === null);
    if (shot) {
      shot.targetKey = targetKey;
      shot.onImpact = onImpact;
      return true;
    }

    const projectile = this.active.find(
      (p) =>
        p.shooterId === playerId &&
        p.targetKey === null &&
        p.onImpact === null &&
        !p.finished,
    );
    if (projectile) {
      projectile.targetKey = targetKey;
      projectile.onImpact = onImpact;
      return true;
    }

    return false;
  }

  advance(deltaMs: number): void {
    this.advancePending(deltaMs);
    this.advanceActive(deltaMs);
  }

  private advancePending(deltaMs: number): void {
    for (const [playerId, queue] of this.pending) {
      for (let i = queue.length - 1; i >= 0; i--) {
        const shot = queue[i];
        shot.releaseInMs -= deltaMs;
        if (shot.releaseInMs > 0) continue;
        queue.splice(i, 1);
        this.launch(shot);
      }
      if (!queue.length) this.pending.delete(playerId);
    }
  }

  private launch(shot: PendingShot): void {
    const mapRenderer = this.client.mapRenderer;
    const from = mapRenderer?.getEntityIsoScreenPosition(
      `char:${shot.playerId}`,
    );
    if (!from) {
      // The shooter is gone. Never drop the bundle on the floor — releasing
      // it keeps HP bars and death state truthful even with no arrow.
      shot.onImpact?.();
      return;
    }

    const to = shot.targetKey
      ? mapRenderer?.getEntityIsoScreenPosition(shot.targetKey)
      : this.rayEndIso(shot.playerId);
    if (shot.targetKey && !to) {
      // The attached target had already stopped resolving by release time
      // (dead, despawned, warped away) — same situation as the
      // missing-shooter check above. Release now instead of falling back to
      // a targetless ray flight that would still carry the bundle, firing it
      // at a wall well after the moment the target actually vanished.
      shot.onImpact?.();
      return;
    }
    const target = to ?? this.rayEndIso(shot.playerId);
    if (!target) {
      shot.onImpact?.();
      return;
    }

    const bodyY = from.y - FLIGHT_LIFT;
    const toY = target.y - FLIGHT_LIFT;

    // Push the launch point forward along the firing line so the arrow leaves
    // the bow rather than materialising inside the character. Anchoring it at
    // the shooter's own tile centre put it at centre mass, visibly inside the
    // sprite for the first frames of every shot.
    //
    // Clamped to half the distance so a point-blank shot cannot start past the
    // thing it is flying at, and guarded against a zero-length vector (target
    // standing on the shooter) which would divide by zero.
    const spanX = target.x - from.x;
    const spanY = toY - bodyY;
    const span = Math.hypot(spanX, spanY);
    const muzzle = span > 0 ? Math.min(MUZZLE_OFFSET, span / 2) : 0;
    const fromX = span > 0 ? from.x + (spanX / span) * muzzle : from.x;
    const fromY = span > 0 ? bodyY + (spanY / span) * muzzle : bodyY;

    // Duration is measured from the MUZZLE, not the body, so shortening the
    // path does not leave the arrow crawling the remaining distance.
    const distance = Math.hypot(target.x - fromX, toY - fromY);
    const tiles = distance / TILE_ISO_PX;
    const durationMs = Math.max(
      MIN_FLIGHT_MS,
      (tiles / ARROW_TILES_PER_SEC) * 1000,
    );

    const projectile = this.pool.pop() ?? new Projectile();
    projectile.reset(
      getArrowVisual(shot.element),
      shot.playerId,
      fromX,
      fromY,
      target.x,
      toY,
      // A targetless shot has nothing to home on: it flies to the fixed ray
      // end and fizzles.
      to ? shot.targetKey : null,
      durationMs,
      shot.onImpact,
    );
    projectile.refreshTexture();
    projectile.mount(this.client.worldContainer);
    this.active.push(projectile);
  }

  /** Where a targetless shot fizzles: the far end of the same ray the server
   *  walks, so the arrow stops where the server would have stopped it — at a
   *  wall, or at the edge of reach.
   *
   *  LOCAL PLAYER ONLY, and that limit is a data one, not an oversight.
   *  `itemAttackRanges` (family 55) is keyed by ITEM id, but a nearby
   *  character's `equipment.weapon` is the WORN GRAPHIC id — the same number
   *  space `getWeaponMetadata` and the GFX loader use, not an item id. Only
   *  our own paperdoll (`client.equipment`) carries the real item id, so only
   *  our own reach can be resolved. Looking a graphic id up in that map is
   *  what silently suppressed every missed shot's arrow.
   *
   *  Delegates to `localAttackRayTiles`, which already resolves this
   *  correctly for the weapon-range indicator — one implementation, so the
   *  arrow and the indicator cannot disagree about where reach ends.
   *
   *  Another player's MISSED shot therefore draws no arrow; their hits are
   *  unaffected, since a hit gets its target from the damage packet and never
   *  consults reach. Closing that gap needs a worn-graphic -> item reverse
   *  lookup over the EIF (`spec1`), which is ambiguous when two weapons share
   *  a graphic and would need re-building on every pub hot-reload. */
  private rayEndIso(playerId: number): { x: number; y: number } | null {
    if (playerId !== this.client.playerId) return null;
    const tiles = localAttackRayTiles(this.client);
    const last = tiles[tiles.length - 1];
    if (!last) return null;
    return isoToScreen(last);
  }

  private advanceActive(deltaMs: number): void {
    const mapRenderer = this.client.mapRenderer;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];

      // Homing: re-read the target's live RAW iso point every frame so an NPC
      // that walks mid-flight is still struck on its body.
      //
      // A null result means the target is GONE — removed after its death
      // animation, cleaned up out of range, warped away. This one check
      // stands in for hooking every removal site, and it is what stops an
      // arrow landing on empty ground when someone else kills your target
      // mid-flight: the flight ends where the arrow is and the bundle fires
      // there. An NPC merely PLAYING its death animation still resolves, so
      // the arrow lands on it normally, which is the look we want.
      if (p.targetKey) {
        const iso = mapRenderer?.getEntityIsoScreenPosition(p.targetKey);
        if (iso) {
          p.toIsoX = iso.x;
          p.toIsoY = iso.y - FLIGHT_LIFT;
        } else {
          p.collapse();
        }
      }

      p.step(deltaMs);

      // Bake EVERY frame. The interpolated point is a fixed WORLD point, but
      // worldContainer coords are camera-relative, so the same point bakes to
      // a different sprite position whenever the camera moves.
      const now = p.currentIso();
      const baked = mapRenderer?.bakeIsoToWorldSprite(now.x, now.y);
      if (baked) p.updatePosition(baked.x, baked.y);

      // zIndex is NOT re-derived here. It used to follow the target's own
      // paint order for the whole flight, but a target north of the shooter
      // sorts LOWER than the shooter, which put every up-facing shot behind
      // the scenery between them — half of all shots flying behind walls
      // and trees they should cross. A targetless shot never had that
      // problem (it always used the flat PROJECTILE_Z_INDEX_FALLBACK from
      // Projectile.reset), which meant homing and fizzling flights looked
      // different on the identical path. Both now use the same flat
      // fallback for the whole flight: an arrow in flight is a foreground
      // element, same precedent as SkillBurst's BURST_Z_INDEX_FALLBACK.
      p.refreshTexture();

      if (p.finished) {
        p.releaseImpact();
        p.unmount();
        this.active.splice(i, 1);
        this.pool.push(p);
      }
    }
  }

  /** Scene rebuild / map change.
   *
   *  'release' (the default): bundles fire where they stand. This is correct
   *  for a SAME-map rebuild (handleInitMapMutation: the server pushes an
   *  edited version of the CURRENT map's data and calls setMap again without
   *  touching client.nearby) as well as for a first-ever setMap with no
   *  entities loaded yet (main.tsx bootstrap, handleInitFileEmf at login) —
   *  the entities a bundle references are still the ones it was captured
   *  against, so losing the bundle would leave an HP bar or a death that the
   *  server already applied permanently unshown on the client.
   *
   *  'drop': bundles are discarded unfired. This is required for a REAL map
   *  change (handleWarpAgree's cross-map branch): client.nearby is replaced
   *  with the NEW map's entities before Client.setMap runs, so by the time
   *  this fires, a targetKey like "npc:5" captured on the OLD map may name a
   *  live, unrelated NPC on the NEW one. Releasing there doesn't preserve
   *  truth, it corrupts a healthy entity — playing a death animation on it,
   *  dropping a phantom item at the old map's coordinates, painting HP/damage
   *  onto the wrong target. There is no client state left after a map change
   *  that a dropped bundle could have kept truthful. */
  clear(mode: 'release' | 'drop' = 'release'): void {
    for (const queue of this.pending.values()) {
      if (mode === 'release') {
        for (const shot of queue) shot.onImpact?.();
      }
    }
    this.pending.clear();
    for (const p of this.active) {
      if (mode === 'release') p.releaseImpact();
      p.unmount();
    }
    this.pool.push(...this.active);
    this.active = [];
  }
}
