import { useEffect, useRef, useState } from 'preact/hooks';
import type { Client } from '@/client';
import type { CombatPopup, HpBarEntry } from '@/controllers';
import { useClient } from '@/ui/context';
import { combatElementColor } from './element-colors';
import './CombatOverlay.css';

const TILE_HALF_W = 32;
const TILE_HALF_H = 16;

/** Returns screen pixels (relative to the viewport) for a world tile. */
function worldToScreen(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  halfGameWidth: number,
  halfGameHeight: number,
): { x: number; y: number } {
  const tileScreenX = (worldX - worldY) * TILE_HALF_W;
  const tileScreenY = (worldX + worldY) * TILE_HALF_H;
  return {
    x: Math.floor(tileScreenX - cameraX + halfGameWidth),
    y: Math.floor(tileScreenY - cameraY + halfGameHeight),
  };
}

/** Smoothed iso-world screen position for the entity behind a key.
 *  Returns null when the entity is no longer in `client.nearby` —
 *  i.e. an NPC's death animation has finished and the corpse has
 *  been despawned, or a character has walked out of view. */
function liveIsoScreenFor(
  client: Client,
  key: string | undefined,
): { x: number; y: number } | null {
  if (!key) return null;
  return client.mapRenderer?.getEntityIsoScreenPosition(key) ?? null;
}

/** Visual top of the character / NPC head, in px above the iso tile
 *  center (which sits at the sprite's feet). Tuned by eyeballing for
 *  the typical EO character sprite — bump this single number if the
 *  whole stack (HP bar + damage popup) needs to shift up or down to
 *  hug a different sprite size. */
const HEAD_TOP_OFFSET = 60;
/** Height of `.combat-hpbar` — keep in sync with the CSS rule. */
const HP_BAR_HEIGHT = 4;
/** Vertical span of a single damage popup line at 14 px font + 1.2
 *  line-height — used to space the popup's bottom against the HP bar's
 *  top so the popup appears to launch *from* the bar rather than
 *  overlap with it. */
const POPUP_LINE_HEIGHT = 17;
/** HP bar TOP edge sits HP_BAR_HEIGHT px above the head top, so the
 *  bar's BOTTOM edge just kisses the head. */
const HPBAR_HEAD_OFFSET_Y = HEAD_TOP_OFFSET + HP_BAR_HEIGHT;
/** Damage popup TOP edge sits one line-height above HP bar TOP, so the
 *  popup's BOTTOM kisses the HP bar's TOP at spawn. The CSS animation
 *  flies it further upward from there. */
const POPUP_HEAD_OFFSET_Y = HPBAR_HEAD_OFFSET_Y + POPUP_LINE_HEIGHT;

export function CombatOverlay() {
  const client = useClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  // Drive a re-render every animation frame. Pixi sprites live inside
  // worldContainer and scroll with the camera for free; DOM nodes need
  // a fresh read of cameraX/cameraY/halfGameWidth/Height every frame
  // to follow the camera as the player walks. Also expires popups via
  // tick() on the same tick.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      client.combatOverlayController.tick();
      force((n) => (n + 1) % 65536);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client]);

  const cameraX = client.mapRenderer?.lastPlayerScreen?.x ?? 0;
  const cameraY = client.mapRenderer?.lastPlayerScreen?.y ?? 0;
  const halfW = client.mapRenderer?.halfGameWidthPublic ?? 0;
  const halfH = client.mapRenderer?.halfGameHeightPublic ?? 0;
  // The Pixi canvas is rendered at logical resolution `gameWidth x
  // gameHeight` and CSS-scaled to `gameWidth*zoom x gameHeight*zoom`
  // to fill the window. Our `left/top` math is in logical-canvas
  // coords; CSS-scaling the overlay by the same factor keeps it in
  // lockstep with the Pixi sprites (e.g. characters, NPCs).
  const zoom = client.viewportController?.getZoom?.() ?? 1;

  const { popups, hpBars } = client.combatOverlayController.tick();

  return (
    <div
      ref={containerRef}
      class='combat-overlay'
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
      }}
    >
      {popups.map((p) =>
        renderPopup(p, client, cameraX, cameraY, halfW, halfH),
      )}
      {hpBars.map((b) =>
        renderHpBar(b, client, cameraX, cameraY, halfW, halfH),
      )}
    </div>
  );
}

function renderPopup(
  p: CombatPopup,
  client: Client,
  cameraX: number,
  cameraY: number,
  halfW: number,
  halfH: number,
) {
  // Prefer the smoothed live iso position so the popup follows the
  // sprite during walk animations. If the target is gone (death),
  // fall back to the tile-coord snapshot so the popup still flies up
  // from where the hit landed.
  const liveIso = liveIsoScreenFor(client, p.targetKey);
  let x: number;
  let y: number;
  if (liveIso) {
    x = Math.floor(liveIso.x - cameraX + halfW);
    y = Math.floor(liveIso.y - cameraY + halfH);
  } else {
    const s = worldToScreen(p.worldX, p.worldY, cameraX, cameraY, halfW, halfH);
    x = s.x;
    y = s.y;
  }
  const color = p.kind === 'heal' ? '#4ade80' : combatElementColor(p.element);
  // Element-matchup treatment (NPC damage only): WEAK pops big + glows + adds
  // an up-chevron; RESIST shrinks + greys + adds a down-chevron.
  const eff = p.kind === 'damage' ? p.effectiveness : 'neutral';
  const effClass = eff === 'neutral' ? '' : ` combat-popup--${eff}`;
  const arrow = eff === 'weak' ? '↑' : eff === 'resist' ? '↓' : '';
  const label = p.kind === 'miss' ? 'miss' : String(p.amount);
  return (
    <div
      key={p.id}
      class={`combat-popup combat-popup--${p.kind}${effClass}`}
      style={{
        left: `${x}px`,
        top: `${y - POPUP_HEAD_OFFSET_Y}px`,
        color,
      }}
    >
      {label}
      {arrow && <span class='combat-popup__arrow'>{arrow}</span>}
    </div>
  );
}

function renderHpBar(
  bar: HpBarEntry,
  client: Client,
  cameraX: number,
  cameraY: number,
  halfW: number,
  halfH: number,
) {
  // HP bar only renders when the target is still present in
  // client.nearby. As soon as the target is despawned (NPC death
  // animation finished, character left view) the bar disappears,
  // even if the 3 s timer hasn't expired.
  const liveIso = liveIsoScreenFor(client, bar.key);
  if (!liveIso) return null;
  const x = Math.floor(liveIso.x - cameraX + halfW);
  const y = Math.floor(liveIso.y - cameraY + halfH);
  const fillColor =
    bar.percent < 25 ? '#dc2626' : bar.percent < 50 ? '#facc15' : '#22c55e';
  return (
    <div
      key={`hpbar:${bar.key}`}
      class='combat-hpbar'
      style={{
        left: `${x - 20}px`,
        top: `${y - HPBAR_HEAD_OFFSET_Y}px`,
      }}
    >
      <div
        class='combat-hpbar__fill'
        style={{
          width: `${Math.max(0, Math.min(100, bar.percent)) * 0.4}px`,
          background: fillColor,
        }}
      />
    </div>
  );
}
