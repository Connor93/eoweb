import { AdminLevel, type CharacterMapInfo, SitState } from 'eolib';
import type { Client } from '@/client';
import {
  CharacterDeathAnimation,
  CharacterSpellChantAnimation,
} from '@/render';
import { useClient } from '@/ui/context';
import { capitalize } from '@/utils';
import {
  EntityTooltip,
  type EntityTooltipModel,
  type TooltipRow,
  useTooltipFrame,
} from './entity-tooltip';

/** Up-offset (logical canvas px) to float the tooltip above the player's
 *  head, by sit state — mirrors the old sprite nameplate's offsets. */
function sitUpOffset(sitState: SitState): number {
  switch (sitState) {
    case SitState.Floor:
      return 50;
    case SitState.Chair:
      return 56;
    default: // Stand
      return 72;
  }
}

/** Build the tooltip model for a player. Name + level always; class row when
 *  the ECF resolves a class name; guild row (the 3-char tag) when the player
 *  is in a guild. Rows are plain (uncolored) text. */
export function buildPlayerTooltipModel(
  character: CharacterMapInfo,
  client: Client,
): EntityTooltipModel {
  const rows: TooltipRow[] = [];

  const className = client.getEcfRecordById(character.classId)?.name;
  if (className) {
    rows.push({ text: className });
  }

  const guildTag = character.guildTag.trim();
  if (guildTag) {
    rows.push({ text: `Guild: ${guildTag}` });
  }

  return {
    name: capitalize(character.name),
    level: character.level,
    rows,
  };
}

export function PlayerTooltip() {
  const client = useClient();
  useTooltipFrame(client);

  const id = client.hoveredCharacterId;
  if (id === null) return null;

  const character = client.getCharacterById(id);
  if (!character) return null;

  // Carry over the old sprite nameplate's guards: hide an invisible player
  // unless you're an admin, and suppress during chat bubble / death /
  // spell-chant (the bubble or animation would otherwise clash).
  if (character.invisible && client.admin === AdminLevel.Player) return null;
  if (client.animationController.characterChats.get(id)) return null;
  const animation = client.animationController.characterAnimations.get(id);
  if (
    animation instanceof CharacterDeathAnimation ||
    animation instanceof CharacterSpellChantAnimation
  ) {
    return null;
  }

  const model = buildPlayerTooltipModel(character, client);

  const cameraX = client.mapRenderer?.lastPlayerScreen?.x ?? 0;
  const cameraY = client.mapRenderer?.lastPlayerScreen?.y ?? 0;
  const halfW = client.mapRenderer?.halfGameWidthPublic ?? 0;
  const halfH = client.mapRenderer?.halfGameHeightPublic ?? 0;
  const zoom = client.viewportController?.getZoom?.() ?? 1;

  const up = sitUpOffset(character.sitState);

  // Smooth-follow the player sprite (incl. walk interpolation) via the shared
  // helper, same path the sprite is drawn with.
  const liveScreen =
    client.mapRenderer?.getEntityIsoScreenPosition(`char:${id}`) ?? null;
  if (!liveScreen) return null;

  const x = Math.floor(liveScreen.x - cameraX + halfW);
  const y = Math.floor(liveScreen.y - cameraY + halfH - up);

  return <EntityTooltip x={x} y={y} zoom={zoom} model={model} />;
}
