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

// The one danger cue on a name plate: an Aggressive NPC attacks on sight
// (REOSERV act_npcs.rs chases/attacks the nearest player only for this type).
// Every other behavior/role renders muted so red stays meaningful. Chosen for
// legibility on the bg-base-300 bubble.
const AGGRESSIVE_COLOR = '#f87171'; // red-400

/** A one-line behavior/role descriptor for the name plate, derived from the
 *  NPC's ENF `type`. Only Aggressive is colored; reserved/unknown types get no
 *  line. Passive = only fights back; the role types drive shop/bank/etc. */
function npcBehaviorRow(type: NpcType): TooltipRow | null {
  switch (type) {
    case NpcType.Aggressive:
      return { text: 'Aggressive', color: AGGRESSIVE_COLOR };
    case NpcType.Passive:
      return { text: 'Passive' };
    case NpcType.Friendly:
      return { text: 'Friendly' };
    case NpcType.Shop:
      return { text: 'Shopkeeper' };
    case NpcType.Inn:
      return { text: 'Innkeeper' };
    case NpcType.Bank:
      return { text: 'Banker' };
    case NpcType.Barber:
      return { text: 'Barber' };
    case NpcType.Guild:
      return { text: 'Guild Master' };
    case NpcType.Priest:
      return { text: 'Priest' };
    case NpcType.Lawyer:
      return { text: 'Lawyer' };
    case NpcType.Trainer:
      return { text: 'Skill Master' };
    case NpcType.Quest:
      return { text: 'Quest' };
    default:
      return null;
  }
}

/** Build the tooltip model from an NPC's ENF record. Every NPC shows a
 *  behavior/role subtitle under its name. Combat NPCs additionally show level +
 *  a damage-type row (None renders as "Plain") and, when the NPC has one, a
 *  weakness row. Rows are colored element badges; future per-instance affixes
 *  append here. */
export function buildNpcTooltipModel(record: EnfRecord): EntityTooltipModel {
  const subtitle = npcBehaviorRow(record.type) ?? undefined;

  if (!COMBAT_NPC_TYPES.has(record.type)) {
    return { name: record.name, subtitle, rows: [] };
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

  return { name: record.name, subtitle, level: record.level, rows };
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
