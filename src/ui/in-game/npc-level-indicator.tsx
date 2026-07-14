import { type NpcMapInfo, NpcType } from 'eolib';
import { FaCaretDown, FaCaretUp } from 'react-icons/fa';
import type { Client } from '@/client';
import { NpcDeathAnimation } from '@/render';
import { useClient } from '@/ui/context';
import { useTooltipFrame } from './entity-tooltip';

const COMBAT_NPC_TYPES = new Set<NpcType>([
  NpcType.Passive,
  NpcType.Aggressive,
]);

// Enemy is a HIGHER level than you (harder) → red up-arrow; LOWER (easier) →
// green down-arrow. Equal / unknown level → no arrow (keeps a screen of
// same-level mobs clean). Colors match the name-plate danger red.
const HIGHER_COLOR = '#f87171'; // red-400
const LOWER_COLOR = '#4ade80'; // green-400

/** Logical-canvas px the arrow floats above the NPC's iso tile center (feet).
 *  Mirrors the name-plate anchor (per-NPC `nameLabelOffset` for sprite height)
 *  plus a gap so the arrow clears the name that appears on hover. */
const ARROW_BASE_UP = 40;
const ARROW_SIZE = 14;

/**
 * Always-visible per-enemy level indicator: a small arrow above each combat
 * NPC's head showing whether it out-levels the player, so you don't have to
 * hover to gauge difficulty. DOM overlay in the same coordinate space as the
 * name plate / HP bars (zoom-scaled, camera-followed, re-rendered each frame).
 */
export function NpcLevelIndicator() {
  const client = useClient();
  useTooltipFrame(client);

  const playerLevel = client.level;
  // No baseline to compare against yet (pre-login / level unknown).
  if (!playerLevel) return null;

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
        // World-overlay layer, matching CombatOverlay's HP bars (z-index 5):
        // above the game canvas but below UI dialogs, so always-on arrows don't
        // poke through an open inventory/character panel. The hover name plate
        // (z 9998) still renders on top of these when you mouse over an NPC.
        zIndex: 5,
      }}
    >
      {npcs.map((npc) =>
        renderArrow(npc, client, playerLevel, cameraX, cameraY, halfW, halfH),
      )}
    </div>
  );
}

function renderArrow(
  npc: NpcMapInfo,
  client: Client,
  playerLevel: number,
  cameraX: number,
  cameraY: number,
  halfW: number,
  halfH: number,
) {
  const record = client.getEnfRecordById(npc.id);
  if (!record) return null;
  // Only fightable enemies — service NPCs (shop/bank/quest/…) have no level.
  if (!COMBAT_NPC_TYPES.has(record.type)) return null;

  const enemyLevel = record.level;
  // Unknown (unauthored) or equal level → no arrow.
  if (!enemyLevel || enemyLevel === playerLevel) return null;

  // Suppress while the NPC is playing its death animation (about to despawn),
  // matching the name plate.
  const anim = client.animationController.npcAnimations.get(npc.index);
  if (anim instanceof NpcDeathAnimation) return null;

  // Smooth-follow the sprite (incl. walk interpolation) via the shared helper
  // the name plate / HP bars use. Null once the NPC leaves `nearby`.
  const iso = client.mapRenderer?.getEntityIsoScreenPosition(
    `npc:${npc.index}`,
  );
  if (!iso) return null;

  const meta = client.getNpcMetadata(record.graphicId);
  const up = ARROW_BASE_UP + meta.nameLabelOffset;
  const x = Math.floor(iso.x - cameraX + halfW);
  const y = Math.floor(iso.y - cameraY + halfH - up);

  const higher = enemyLevel > playerLevel;
  const Icon = higher ? FaCaretUp : FaCaretDown;
  const color = higher ? HIGHER_COLOR : LOWER_COLOR;

  return (
    <div
      key={`lvlind:${npc.index}`}
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        // Center horizontally on the NPC; bottom edge at (x, y).
        transform: 'translate(-50%, -100%)',
        color,
        // Dark halo so the colored glyph reads over any map tile.
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.9))',
      }}
    >
      <Icon size={ARROW_SIZE} />
    </div>
  );
}
