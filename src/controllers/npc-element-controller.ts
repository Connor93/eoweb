import { Element as EolibElement } from 'eolib';
import type { Texture } from 'pixi.js';
import type { Client } from '@/client';
import {
  CombatElement,
  eolibToCombatElement,
} from '@/combat-overlay/element-colors';
import { NpcElementGlow } from '@/render';

/**
 * Owns the procedural NPC element aura.
 *
 * For each visible NPC with a non-Plain element, lays a tinted blurred copy of
 * the NPC's frame texture just behind it (aura ringing the silhouette) plus a
 * faint tint just in front (light body wash). Nodes live in
 * `client.worldContainer` so they depth-sort with their NPC. Lifecycle mirrors
 * MapRenderer's begin/render/end sweep and `WeaponElementController`.
 */
export class NpcElementController {
  private readonly client: Client;
  private readonly glows = new Map<number, NpcElementGlow>();
  private readonly glowPool: NpcElementGlow[] = [];
  private readonly seen = new Set<number>();

  constructor(client: Client) {
    this.client = client;
  }

  /** An NPC's element as a CombatElement (eolib's enum ordering differs, so it
   *  must be remapped by name — same path NPC damage popups use). */
  resolveNpcElement(npcId: number): CombatElement {
    return eolibToCombatElement(
      this.client.getEnfRecordById(npcId)?.element ?? EolibElement.None,
    );
  }

  beginFrame(): void {
    this.seen.clear();
  }

  /** Place an NPC's aura this frame. Caller passes the NPC sprite's final
   *  placement (x/y/scaleX) and zIndex so the glow overlays it exactly; the
   *  halo sits just behind the body, the tint just in front. */
  renderFor(
    npcIndex: number,
    texture: Texture,
    x: number,
    y: number,
    scaleX: number,
    element: CombatElement,
    npcZIndex: number,
  ): void {
    if (element === CombatElement.Plain) return;

    this.seen.add(npcIndex);
    let glow = this.glows.get(npcIndex);
    if (!glow) {
      glow = this.glowPool.pop() ?? new NpcElementGlow();
      this.glows.set(npcIndex, glow);
      this.client.worldContainer.addChild(glow.halo);
      this.client.worldContainer.addChild(glow.tint);
    }
    glow.update(
      texture,
      x,
      y,
      scaleX,
      element,
      npcZIndex - 0.5,
      npcZIndex + 0.5,
    );
  }

  endFrame(): void {
    for (const [npcIndex, glow] of this.glows) {
      if (!this.seen.has(npcIndex)) {
        this.recycle(glow);
        this.glows.delete(npcIndex);
      }
    }
  }

  /** Tear down active auras (called on map change). The pool survives. */
  clear(): void {
    for (const glow of this.glows.values()) {
      this.recycle(glow);
    }
    this.glows.clear();
    this.seen.clear();
  }

  private recycle(glow: NpcElementGlow): void {
    this.client.worldContainer.removeChild(glow.halo);
    this.client.worldContainer.removeChild(glow.tint);
    glow.halo.visible = false;
    glow.tint.visible = false;
    this.glowPool.push(glow);
  }
}
