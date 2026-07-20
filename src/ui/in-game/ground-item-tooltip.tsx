import { useEffect, useState } from 'preact/hooks';
import {
  CombatElement,
  combatElementColor,
  combatElementLabel,
} from '@/combat-overlay';
import { type InstanceRarity, instanceRarityLabel } from '@/controllers';
import { useClient } from '@/ui/context';
import {
  attackSpeedLine,
  formatInstanceBaseStats,
  formatInstanceMod,
  getItemMeta,
  isoToScreen,
  rangeLine,
} from '@/utils';

// Local copy of rarityTextClass — not exported from inventory-grid.
// Keep in sync with inventory-grid.tsx if rarity colors change.
function rarityTextClass(r: InstanceRarity): string {
  switch (r) {
    case 0: // Common
      return 'text-base-content/70';
    case 1: // Rare
      return 'text-info';
    case 2: // Epic
      return 'text-secondary';
    case 3: // Legendary
      return 'text-warning';
    default:
      return 'text-base-content/70';
  }
}

/** Vertical pixels (in logical canvas coords) to lift the tooltip
 *  above the tile center so it floats above the item sprite. */
const TOOLTIP_UP_OFFSET = 24;

export function GroundItemTooltip() {
  const client = useClient();
  const [, force] = useState(0);

  // Drive a re-render every animation frame — same pattern as
  // CombatOverlay — so the tooltip follows the camera as the player walks.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((n) => (n + 1) % 65536);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client]);

  const uid = client.hoveredItemUid;
  if (uid === null) return null;

  const item = client.nearby.items.find((i) => i.uid === uid);
  if (!item) return null;

  const cameraX = client.mapRenderer?.lastPlayerScreen?.x ?? 0;
  const cameraY = client.mapRenderer?.lastPlayerScreen?.y ?? 0;
  const halfW = client.mapRenderer?.halfGameWidthPublic ?? 0;
  const halfH = client.mapRenderer?.halfGameHeightPublic ?? 0;
  const zoom = client.viewportController?.getZoom?.() ?? 1;

  // Convert the item's tile coords to screen position.
  const tileScreen = isoToScreen(item.coords);
  const x = Math.floor(tileScreen.x - cameraX + halfW);
  const y = Math.floor(tileScreen.y - cameraY + halfH - TOOLTIP_UP_OFFSET);

  const inst = client.instanceController.groundInstanceByIndex(uid);

  let content: preact.ComponentChildren;

  if (inst) {
    // Instance panel: rarity-colored name + [Rarity], Level N, element,
    // attack speed, then one line per mod.
    const nameColorClass = rarityTextClass(inst.rarity);
    const rarityLabel = instanceRarityLabel(inst.rarity);
    const record = client.getEifRecordById(inst.baseItemId);
    const name = record?.name ?? `Item ${inst.baseItemId}`;
    const speedLine = attackSpeedLine(client, inst.baseItemId);
    const rangeText = rangeLine(client, inst.baseItemId);

    content = (
      <>
        <div class={`font-semibold ${nameColorClass}`}>
          {name} <span class='text-[10px] opacity-70'>[{rarityLabel}]</span>
        </div>
        <div class='opacity-70'>Level {inst.level}</div>
        {inst.element !== CombatElement.Plain && (
          <div
            style={{
              color: combatElementColor(inst.element),
              fontSize: '11px',
            }}
          >
            {combatElementLabel(inst.element)}
          </div>
        )}
        {speedLine && <div class='opacity-70'>{speedLine}</div>}
        {rangeText && <div class='opacity-70'>{rangeText}</div>}
        {record &&
          formatInstanceBaseStats(record, inst.level).map((line, i) => (
            <div key={`base-${i}`} class='opacity-70'>
              {line}
            </div>
          ))}
        {inst.mods.map((m, i) => (
          <div key={i} class='opacity-70'>
            {formatInstanceMod(m)}
          </div>
        ))}
      </>
    );
  } else {
    // Plain stack: "Name xN" (hide x1) + base meta stats, matching the
    // inventory tooltip. Non-instanced items keep their full (max-level)
    // base, so getItemMeta's raw pub values are correct here.
    const record = client.getEifRecordById(item.id);
    const name = record?.name ?? `Item ${item.id}`;
    const qty = item.amount > 1 ? ` x${item.amount.toLocaleString()}` : '';
    const meta = record ? getItemMeta(record) : [];
    const speedLine = attackSpeedLine(client, item.id);
    const rangeText = rangeLine(client, item.id);
    content = (
      <>
        <div class='font-semibold'>
          {name}
          {qty}
        </div>
        {meta.map((line, i) => (
          <div key={`meta-${i}`} class='opacity-70'>
            {line}
          </div>
        ))}
        {speedLine && <div class='opacity-70'>{speedLine}</div>}
        {rangeText && <div class='opacity-70'>{rangeText}</div>}
      </>
    );
  }

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
          class='w-max max-w-56 rounded bg-base-300 px-2 py-1 text-xs shadow-lg'
          // scale(0.45): the tooltip already rides the wrapper's scale(zoom);
          // this sets its on-screen size (0.3 read too small, +50% → 0.45).
          // origin center-bottom keeps the bubble's tip anchored over the tile.
          style={{
            transform: 'translate(-50%, -100%) scale(0.45)',
            transformOrigin: 'center bottom',
          }}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
