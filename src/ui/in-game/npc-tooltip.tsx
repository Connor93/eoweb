import { Element, type EnfRecord, NpcType } from 'eolib';
import { combatElementColor, combatElementLabel } from '@/combat-overlay';
import { eolibToCombatElement } from '@/combat-overlay/element-colors';
import { NpcDeathAnimation } from '@/render';
import { useClient } from '@/ui/context';
import {
  EntityTooltip,
  type EntityTooltipModel,
  type TooltipRow,
  useTooltipFrame,
} from './entity-tooltip';

const COMBAT_NPC_TYPES = new Set<NpcType>([
  NpcType.Passive,
  NpcType.Aggressive,
]);

/** Build the tooltip model from an NPC's ENF record. Combat NPCs show level +
 *  a damage-type row (None renders as "Plain") and, when the NPC has one, a
 *  weakness row. Non-combat NPCs show name only. Rows are colored element
 *  badges; future per-instance affixes append here. */
export function buildNpcTooltipModel(record: EnfRecord): EntityTooltipModel {
  if (!COMBAT_NPC_TYPES.has(record.type)) {
    return { name: record.name, rows: [] };
  }

  const rows: TooltipRow[] = [];

  // Damage type — always shown for combat NPCs.
  const damage = eolibToCombatElement(record.element);
  rows.push({
    text: combatElementLabel(damage),
    color: combatElementColor(damage),
  });

  // Weakness — only when the NPC actually has one.
  if (record.elementWeakness !== Element.None) {
    const weakness = eolibToCombatElement(record.elementWeakness);
    rows.push({
      text: `Weak: ${combatElementLabel(weakness)}`,
      color: combatElementColor(weakness),
    });
  }

  return { name: record.name, level: record.level, rows };
}

/** Vertical pixels (logical canvas coords) added on top of the per-NPC
 *  nameLabelOffset to float the tooltip above the NPC's head. ~one tile. */
const TOOLTIP_BASE_UP = 28;

export function NpcTooltip() {
  const client = useClient();
  useTooltipFrame(client);

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

  // Smooth-follow the NPC sprite (incl. walk interpolation) via the shared
  // map-renderer helper that CombatOverlay's HP bars use.
  const liveScreen =
    client.mapRenderer?.getEntityIsoScreenPosition(`npc:${index}`) ?? null;
  if (!liveScreen) return null;

  const x = Math.floor(liveScreen.x - cameraX + halfW);
  const y = Math.floor(liveScreen.y - cameraY + halfH - up);

  return <EntityTooltip x={x} y={y} zoom={zoom} model={model} />;
}
