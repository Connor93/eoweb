import { Element, type EnfRecord, NpcType } from 'eolib';
import { useEffect, useState } from 'preact/hooks';
import { combatElementColor, combatElementLabel } from '@/combat-overlay';
import { eolibToCombatElement } from '@/combat-overlay/element-colors';
import { NpcDeathAnimation } from '@/render';
import { useClient } from '@/ui/context';
import { isoToScreen } from '@/utils';

// A single colored badge row in an entity tooltip — a damage type, a
// weakness, and (in a later slice) per-instance affixes. Kept generic so a
// future player tooltip can reuse the same shape.
export interface TooltipBadge {
  label: string;
  color: string;
}

// Display model for the NPC hover tooltip. `level` and `badges` are only
// populated for combat NPCs; non-combat NPCs carry just `name`.
export interface NpcTooltipModel {
  name: string;
  level?: number;
  badges: TooltipBadge[];
}

const COMBAT_NPC_TYPES = new Set<NpcType>([
  NpcType.Passive,
  NpcType.Aggressive,
]);

/** Build the tooltip display model from an NPC's ENF record. Combat NPCs
 *  show level + a damage-type badge (None renders as "Plain") and, when the
 *  NPC has one, a weakness badge. Non-combat NPCs show name only. The
 *  `badges` array is the extension seam: future per-instance affixes append
 *  here, and a future player tooltip reuses this model shape. */
export function buildNpcTooltipModel(record: EnfRecord): NpcTooltipModel {
  if (!COMBAT_NPC_TYPES.has(record.type)) {
    return { name: record.name, badges: [] };
  }

  const badges: TooltipBadge[] = [];

  // Damage type — always shown for combat NPCs.
  const damage = eolibToCombatElement(record.element);
  badges.push({
    label: combatElementLabel(damage),
    color: combatElementColor(damage),
  });

  // Weakness — only when the NPC actually has one.
  if (record.elementWeakness !== Element.None) {
    const weakness = eolibToCombatElement(record.elementWeakness);
    badges.push({
      label: `Weak: ${combatElementLabel(weakness)}`,
      color: combatElementColor(weakness),
    });
  }

  return { name: record.name, level: record.level, badges };
}

/** Vertical pixels (logical canvas coords) added on top of the per-NPC
 *  nameLabelOffset to float the tooltip above the NPC's head. ~one tile;
 *  approximates the old sprite nameplate anchor (TILE_HEIGHT - 4). */
const TOOLTIP_BASE_UP = 28;

export function NpcTooltip() {
  const client = useClient();
  const [, force] = useState(0);

  // Re-render every frame so the tooltip tracks the camera as the player
  // walks — same pattern as GroundItemTooltip / CombatOverlay.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((n) => (n + 1) % 65536);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client]);

  const index = client.hoveredNpcIndex;
  if (index === null) return null;

  const npc = client.getNpcByIndex(index);
  if (!npc) return null;

  const record = client.getEnfRecordById(npc.id);
  if (!record) return null;

  // Match the old sprite nameplate: suppress while the NPC is dying or while
  // a chat bubble is showing (the bubble would otherwise overlap the tooltip).
  if (client.animationController.npcChats.get(index)) return null;
  const animation = client.animationController.npcAnimations.get(index);
  if (animation instanceof NpcDeathAnimation) return null;

  const model = buildNpcTooltipModel(record);

  const cameraX = client.mapRenderer?.lastPlayerScreen?.x ?? 0;
  const cameraY = client.mapRenderer?.lastPlayerScreen?.y ?? 0;
  const halfW = client.mapRenderer?.halfGameWidthPublic ?? 0;
  const halfH = client.mapRenderer?.halfGameHeightPublic ?? 0;
  const zoom = client.viewportController?.getZoom?.() ?? 1;

  const meta = client.getNpcMetadata(record.graphicId);
  const up = TOOLTIP_BASE_UP + meta.nameLabelOffset;

  const tileScreen = isoToScreen(npc.coords);
  const x = Math.floor(tileScreen.x - cameraX + halfW);
  const y = Math.floor(tileScreen.y - cameraY + halfH - up);

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
          {model.level !== undefined && (
            <div class='opacity-70'>Lvl {model.level}</div>
          )}
          {model.badges.map((b, i) => (
            <div key={i} style={{ color: b.color, fontSize: '11px' }}>
              {b.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
