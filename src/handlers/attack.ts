import {
  AttackPlayerServerPacket,
  Emote as EmoteType,
  type EoReader,
  MapTileSpec,
  PacketAction,
  PacketFamily,
} from 'eolib';
import type { Client } from '@/client';
import { CombatElement } from '@/combat-overlay/element-colors';
import {
  CharacterAttackAnimation,
  CharacterRangedAttackAnimation,
  Emote,
} from '@/render';
import { SfxId } from '@/sfx';
import { isBowMetadata, randomRange } from '@/utils';
import { DEFAULT_ARROW_SHAPE } from '@/vfx-engine';

function handleAttackPlayer(client: Client, reader: EoReader) {
  const packet = AttackPlayerServerPacket.deserialize(reader);
  const character = client.nearby.characters.find(
    (c) => c.playerId === packet.playerId,
  );
  if (!character) {
    client.sessionController.requestCharacterRange([packet.playerId]);
    return;
  }

  if (client.animationController.isCharacterDying(packet.playerId)) {
    return;
  }

  character.direction = packet.direction;

  const metadata = client.getWeaponMetadata(character.equipment.weapon);
  const { attackMs } = client.getPlayerRates(packet.playerId);
  client.animationController.pendingCharacterAnimations.set(
    packet.playerId,
    metadata.ranged
      ? new CharacterRangedAttackAnimation(attackMs)
      : new CharacterAttackAnimation(attackMs),
  );

  if (isBowMetadata(metadata)) {
    const element =
      packet.playerId === client.playerId
        ? (client.instanceController.list().find((i) => i.equippedSlot === 8)
            ?.element ?? CombatElement.Plain)
        : client.instanceController.weaponElement(packet.playerId);
    // Other players' shots use the default shape: itemArrowKinds is keyed by
    // ITEM id and a nearby character's equipment.weapon is a worn GRAPHIC id.
    // Resolving it needs an EIF spec1 reverse lookup — see the spec.
    client.projectileController.openShot(
      packet.playerId,
      attackMs,
      element,
      DEFAULT_ARROW_SHAPE,
    );
  }

  const index = randomRange(0, metadata.sfx.length - 1);
  client.audioController.playAtPosition(metadata.sfx[index], character.coords);

  if (metadata.sfx[0] === SfxId.Harp1 || metadata.sfx[0] === SfxId.Guitar1) {
    client.animationController.characterEmotes.set(
      packet.playerId,
      new Emote(EmoteType.Playful + 1),
    );
  }

  const spec = client!.mapRenderer.getTileSpecAt(character.coords);
  if (spec && spec === MapTileSpec.Water) {
    client.animationController.playSplooshieEffect(packet.playerId);
  }
}

export function registerAttackHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    PacketFamily.Attack,
    PacketAction.Player,
    (reader) => handleAttackPlayer(client, reader),
  );
}
