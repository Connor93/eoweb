import { useEffect, useState } from 'preact/hooks';
import type { Client } from '@/client';

// One row under the name in an entity tooltip. `color` set → a colored line
// (e.g. an NPC element badge); omitted → muted default text (e.g. a player's
// class / guild).
export interface TooltipRow {
  text: string;
  color?: string;
}

// Shared display model for entity hover tooltips (NPCs, players). `subtitle`,
// `level`, and `rows` are optional content rendered under the name. `subtitle`
// sits directly beneath the name (e.g. an NPC's behavior/role); `level` and
// `rows` follow.
export interface EntityTooltipModel {
  name: string;
  subtitle?: TooltipRow;
  level?: number;
  rows: TooltipRow[];
}

/** One line under the name: colored when `row.color` is set, else muted. */
function TooltipLine({ row }: { row: TooltipRow }) {
  return row.color ? (
    <div style={{ color: row.color, fontSize: '11px' }}>{row.text}</div>
  ) : (
    <div class='opacity-70'>{row.text}</div>
  );
}

/** Re-render every animation frame so a tooltip tracks the camera / sprite as
 *  things move — shared by the NPC and player tooltips (same pattern as
 *  GroundItemTooltip / CombatOverlay). */
export function useTooltipFrame(client: Client): void {
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((n) => (n + 1) % 65536);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client]);
}

/** Presentational entity tooltip: renders the zoom wrapper + bubble at the
 *  given screen position. Position and model are computed by the caller (the
 *  per-entity container component). */
export function EntityTooltip({
  x,
  y,
  zoom,
  model,
}: {
  x: number;
  y: number;
  zoom: number;
  model: EntityTooltipModel;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
        pointerEvents: 'none',
        zIndex: 9998,
      }}
    >
      <div style={{ position: 'absolute', left: `${x}px`, top: `${y}px` }}>
        <div
          class='w-max max-w-56 rounded bg-base-300 px-2 py-1 text-center text-xs shadow-lg'
          style={{
            transform: 'translate(-50%, -100%) scale(0.45)',
            transformOrigin: 'center bottom',
          }}
        >
          <div class='font-semibold'>{model.name}</div>
          {model.subtitle && <TooltipLine row={model.subtitle} />}
          {model.level !== undefined && (
            <div class='opacity-70'>Lvl {model.level}</div>
          )}
          {model.rows.map((r, i) => (
            <TooltipLine key={i} row={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
