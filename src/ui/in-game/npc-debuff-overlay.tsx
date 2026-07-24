import { type NpcMapInfo, NpcType } from 'eolib';
import type { Client } from '@/client';
import type { StatusView } from '@/controllers';
import { NpcDeathAnimation } from '@/render';
import { useClient } from '@/ui/context';
import { useTooltipFrame } from './entity-tooltip';
import { SkillIcon } from './hud/skill-icon';

const COMBAT_NPC_TYPES = new Set<NpcType>([
  NpcType.Passive,
  NpcType.Aggressive,
]);

/** Logical-canvas px the debuff row floats above the NPC's iso tile center
 *  (feet). Mirrors the name-plate / level-indicator anchor (per-NPC
 *  `nameLabelOffset` for sprite height) plus a taller gap so the row clears
 *  the always-on level-indicator arrow (which sits at `up = 40 + offset`). */
const DEBUFF_BASE_UP = 58;

/**
 * Always-visible per-enemy debuff row: a horizontal strip of red
 * initial-letter chips above each NPC carrying a debuff (e.g. poison), each
 * with an optional depleting timer bar. Fed by
 * `statusController.npcStatuses(index)` (FAMILY_STATUS `entity_kind: npc`).
 * DOM overlay in the same coordinate space as the name plate / HP bars / level
 * indicator (zoom-scaled, camera-followed, re-rendered each frame).
 */
export function NpcDebuffOverlay() {
  const client = useClient();
  useTooltipFrame(client);

  const cameraX = client.mapRenderer?.lastPlayerScreen?.x ?? 0;
  const cameraY = client.mapRenderer?.lastPlayerScreen?.y ?? 0;
  const halfW = client.mapRenderer?.halfGameWidthPublic ?? 0;
  const halfH = client.mapRenderer?.halfGameHeightPublic ?? 0;
  const zoom = client.viewportController?.getZoom?.() ?? 1;

  const npcs = client.nearby?.npcs ?? [];

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
        // World-overlay layer, matching CombatOverlay's HP bars / the level
        // indicator (z-index 5): above the game canvas but below UI dialogs, so
        // always-on debuff chips don't poke through an open inventory/character
        // panel. The hover name plate (z 9998) still renders on top of these.
        zIndex: 5,
      }}
    >
      {npcs.map((npc) =>
        renderDebuffs(npc, client, cameraX, cameraY, halfW, halfH),
      )}
    </div>
  );
}

function renderDebuffs(
  npc: NpcMapInfo,
  client: Client,
  cameraX: number,
  cameraY: number,
  halfW: number,
  halfH: number,
) {
  const record = client.getEnfRecordById(npc.id);
  if (!record) return null;
  // Only fightable enemies — service NPCs (shop/bank/quest/…) never carry
  // combat statuses.
  if (!COMBAT_NPC_TYPES.has(record.type)) return null;

  const debuffs = client.statusController
    .npcStatuses(npc.index)
    .filter((s) => s.isDebuff);
  if (!debuffs.length) return null;

  // Suppress while the NPC is playing its death animation (about to despawn),
  // matching the name plate / level indicator.
  const anim = client.animationController.npcAnimations.get(npc.index);
  if (anim instanceof NpcDeathAnimation) return null;

  // Smooth-follow the sprite (incl. walk interpolation) via the shared helper
  // the name plate / HP bars / level indicator use. Null once the NPC leaves
  // `nearby`.
  const iso = client.mapRenderer?.getEntityIsoScreenPosition(
    `npc:${npc.index}`,
  );
  if (!iso) return null;

  const meta = client.getNpcMetadata(record.graphicId);
  const up = DEBUFF_BASE_UP + meta.nameLabelOffset;
  const x = Math.floor(iso.x - cameraX + halfW);
  const y = Math.floor(iso.y - cameraY + halfH - up);

  return (
    <div
      key={`debuff:${npc.index}`}
      class='flex items-end gap-1'
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        // Center horizontally on the NPC; bottom edge at (x, y).
        transform: 'translate(-50%, -100%)',
      }}
    >
      {debuffs.map((s) => (
        <DebuffChip key={s.statusId} client={client} status={s} />
      ))}
    </div>
  );
}

/** One debuff chip: a red initial-letter badge (matches the buff bar's debuff
 *  chip) plus, when the status shows a timer, a thin depleting bar underneath. */
function DebuffChip({
  client,
  status,
}: {
  client: Client;
  status: StatusView;
}) {
  const showTimer = status.showTimer && !status.permanent;
  const frac = client.statusController.fraction(status);

  return (
    <div class='flex w-5 flex-col items-center gap-0.5' title={status.name}>
      <SkillIcon iconId={status.iconId} label={status.name} tone='debuff' />
      {showTimer && (
        <div class='relative h-1 w-5 overflow-hidden rounded bg-slate-800'>
          <div
            class='absolute inset-y-0 left-0 bg-red-500/80'
            style={{ width: `${frac * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
