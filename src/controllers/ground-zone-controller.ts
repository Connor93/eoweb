import type { Vector2 } from '@/vector';

/** How long a wave's flash keeps a zone's glow bright (ms). */
const PULSE_FLASH_MS = 300;

/** One lasting ground area as the client draws it. */
export interface GroundZone {
  id: number;
  skillId: string;
  center: Vector2;
  radius: number;
  /** The skill's damage element (eolib `Element` value, 0 = none): glow colour. */
  element: number;
  /** Whether waves are stopped by walls between the centre and an enemy. */
  blastBlocked: boolean;
  /** The glowing tiles, computed lazily by the renderer against the map
   *  that is actually loaded (`tilesKey`): on a warp the new map's zones
   *  arrive BEFORE the new map has loaded. */
  tiles: Vector2[];
  tilesKey: unknown;
  /** `performance.now()`-style ms at which the zone ends on its own. */
  endsAt: number;
  /** Until when the glow shows a wave's flash. */
  flashUntil: number;
}

export type GroundZoneAdd = Omit<
  GroundZone,
  'endsAt' | 'flashUntil' | 'tiles' | 'tilesKey'
> & {
  remainingMs: number;
};

/** Lasting ground areas on the current map, from SkillZoneAdd / Remove /
 *  Pulse (family 62 Open / Close / Report). The server announces when a
 *  zone ends; `endsAt` is a fallback so a missed remove can't leave a glow
 *  behind forever. Cleared when the player leaves the map. */
export class GroundZoneController {
  private zones = new Map<number, GroundZone>();

  add(zone: GroundZoneAdd, now: number): void {
    const { remainingMs, ...rest } = zone;
    this.zones.set(zone.id, {
      ...rest,
      tiles: [],
      tilesKey: undefined,
      endsAt: now + Math.max(0, remainingMs),
      flashUntil: 0,
    });
  }

  remove(id: number): void {
    this.zones.delete(id);
  }

  /** A wave fired: flash the zone's glow. Unknown ids are ignored. */
  pulse(id: number, now: number): void {
    const zone = this.zones.get(id);
    if (zone) zone.flashUntil = now + PULSE_FLASH_MS;
  }

  clear(): void {
    this.zones.clear();
  }

  /** Zones still running at `now`; expired ones are dropped. */
  active(now: number): GroundZone[] {
    for (const [id, zone] of this.zones) {
      if (now >= zone.endsAt) this.zones.delete(id);
    }
    return [...this.zones.values()];
  }
}
