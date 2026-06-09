import { useEffect, useRef, useState } from 'preact/hooks';
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

// Diagnostic: log only the FIRST render of each popup so the console
// doesn't flood at 60fps. Cleared after Phase A verification.
const _loggedPopups = new Set<number>();

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
      {popups.map((p) => renderPopup(p, cameraX, cameraY, halfW, halfH))}
      {hpBars.map((b) => renderHpBar(b, cameraX, cameraY, halfW, halfH))}
    </div>
  );
}

function renderPopup(
  p: CombatPopup,
  cameraX: number,
  cameraY: number,
  halfW: number,
  halfH: number,
) {
  const { x, y } = worldToScreen(
    p.worldX,
    p.worldY,
    cameraX,
    cameraY,
    halfW,
    halfH,
  );
  if (!_loggedPopups.has(p.id)) {
    _loggedPopups.add(p.id);
    // biome-ignore lint/suspicious/noConsole: temporary diagnostic for Phase A verify
    console.log('[CombatOverlay] popup', {
      id: p.id,
      kind: p.kind,
      worldXY: { x: p.worldX, y: p.worldY },
      camera: { x: cameraX, y: cameraY },
      half: { w: halfW, h: halfH },
      screenXY: { x, y },
    });
  }
  const color = p.kind === 'heal' ? '#4ade80' : combatElementColor(p.element);
  const label = p.kind === 'miss' ? 'miss' : String(p.amount);
  return (
    <div
      key={p.id}
      class={`combat-popup combat-popup--${p.kind}`}
      style={{
        left: `${x}px`,
        top: `${y - 35}px`,
        color,
      }}
    >
      {label}
    </div>
  );
}

function renderHpBar(
  bar: HpBarEntry,
  cameraX: number,
  cameraY: number,
  halfW: number,
  halfH: number,
) {
  const { x, y } = worldToScreen(
    bar.worldX,
    bar.worldY,
    cameraX,
    cameraY,
    halfW,
    halfH,
  );
  const fillColor =
    bar.percent < 25 ? '#dc2626' : bar.percent < 50 ? '#facc15' : '#22c55e';
  return (
    <div
      key={`hpbar:${bar.key}`}
      class='combat-hpbar'
      style={{
        left: `${x - 20}px`,
        top: `${y - 12}px`,
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
