import { Gender } from 'eolib';
import { CanvasSource, Texture } from 'pixi.js';
import type { Client } from '@/client';
import { CombatElement } from '@/combat-overlay/element-colors';
import { GfxType } from '@/gfx';
import { WeaponElementGlow, weaponGraphicIndex } from '@/render';

/**
 * Owns the procedural weapon-element glow.
 *
 * The glow is a tinted, blurred, additive copy of the weapon's own sprite laid
 * over the composited weapon, so it takes the actual weapon's shape and flares
 * during a swing. Glow nodes live in `client.worldContainer` so each depth-sorts
 * with its character. Lifecycle mirrors MapRenderer's begin/render/end sweep:
 * `beginFrame()` clears the seen set, `renderFor()` (called from inside
 * `MapRenderer.addCharacterSprites`) marks-seen + positions, and `endFrame()`
 * recycles whatever wasn't seen.
 *
 * Weapon textures are loaded once (the gfx loader caches the underlying bitmap,
 * already warm from character compositing) and cached here by graphic id.
 */
export class WeaponElementController {
  private readonly client: Client;
  private readonly glows = new Map<number, WeaponElementGlow>();
  private readonly glowPool: WeaponElementGlow[] = [];
  private readonly seenGlows = new Set<number>();
  private readonly textures = new Map<string, Texture>();
  private readonly pendingTextures = new Set<string>();

  constructor(client: Client) {
    this.client = client;
  }

  /** Resolve a player's equipped weapon element: own player reads the slot-8
   *  instance directly; nearby players use the paperdoll-snapshot cache. */
  resolveWeaponElement(playerId: number): CombatElement {
    if (playerId === this.client.playerId) {
      return (
        this.client.instanceController.list().find((i) => i.equippedSlot === 8)
          ?.element ?? CombatElement.Plain
      );
    }
    return this.client.instanceController.weaponElement(playerId);
  }

  /** Texture for a weapon's sprite on a given character frame, or null while it
   *  loads / when no weapon is drawn on that frame. */
  private weaponTexture(
    gender: number,
    weapon: number,
    characterFrame: number,
  ): Texture | null {
    const index = weaponGraphicIndex(characterFrame);
    if (index === null) return null;
    const gfxType =
      gender === Gender.Female ? GfxType.FemaleWeapons : GfxType.MaleWeapons;
    const graphicId = (weapon - 1) * 100 + index;
    const key = `${gfxType}:${graphicId}`;

    const cached = this.textures.get(key);
    if (cached) return cached;
    if (!this.pendingTextures.has(key)) {
      this.pendingTextures.add(key);
      this.client.gfxLoader
        .loadResource(gfxType, graphicId + 100)
        .then((bitmap) => {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
          const source = new CanvasSource({
            resource: canvas,
            scaleMode: 'nearest',
            label: `weapon-glow-source:${key}`,
          });
          this.textures.set(key, new Texture({ source }));
        })
        .catch(() => {
          // Leave it pending-cleared so a later frame can retry.
        })
        .finally(() => {
          this.pendingTextures.delete(key);
        });
    }
    return null;
  }

  beginFrame(): void {
    this.seenGlows.clear();
  }

  /** Position + (re)draw a character's weapon glow this frame. Called from
   *  MapRenderer.addCharacterSprites with the values it already computed. */
  renderFor(
    playerId: number,
    gender: number,
    weapon: number,
    characterFrame: number,
    anchorX: number,
    anchorY: number,
    mirrored: boolean,
    element: CombatElement,
    attackProgress: number | null,
    zIndex: number,
  ): void {
    if (element === CombatElement.Plain) return;
    const texture = this.weaponTexture(gender, weapon, characterFrame);
    if (!texture) return;

    this.seenGlows.add(playerId);
    let glow = this.glows.get(playerId);
    if (!glow) {
      glow = this.glowPool.pop() ?? new WeaponElementGlow();
      this.glows.set(playerId, glow);
      this.client.worldContainer.addChild(glow.view);
    }
    glow.update(
      texture,
      anchorX,
      anchorY,
      mirrored,
      element,
      attackProgress,
      zIndex,
    );
  }

  endFrame(): void {
    for (const [playerId, glow] of this.glows) {
      if (!this.seenGlows.has(playerId)) {
        this.client.worldContainer.removeChild(glow.view);
        glow.view.visible = false;
        this.glows.delete(playerId);
        this.glowPool.push(glow);
      }
    }
  }

  /** Tear down active glow nodes (called on map change). Pools + the weapon
   *  texture cache survive — they're independent of map/atlas state. */
  clear(): void {
    for (const glow of this.glows.values()) {
      this.client.worldContainer.removeChild(glow.view);
      glow.view.visible = false;
      this.glowPool.push(glow);
    }
    this.glows.clear();
    this.seenGlows.clear();
  }
}
