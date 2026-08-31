import {
  Emote as EmoteType,
  Element as EolibElement,
  type EoReader,
  ItemMapInfo,
  NpcAcceptServerPacket,
  NpcAgreeServerPacket,
  NpcDialogServerPacket,
  NpcJunkServerPacket,
  NpcKillStealProtectionState,
  NpcPlayerServerPacket,
  NpcReplyServerPacket,
  NpcSpecServerPacket,
  PacketAction,
  PacketFamily,
  PlayerKilledState,
} from 'eolib';
import type { Client } from '@/client';
import {
  CombatElement,
  eolibToCombatElement,
  npcElementEffectiveness,
} from '@/combat-overlay/element-colors';
import { ITEM_PROTECT_TICKS_NPC } from '@/consts';
import { EOResourceID } from '@/edf';
import {
  ChatBubble,
  Emote,
  NpcAttackAnimation,
  NpcWalkAnimation,
} from '@/render';
import { SfxId } from '@/sfx';
import { ChatChannels, ChatIcon } from '@/ui/enums';
import { capitalize, getPrevCoords } from '@/utils';

function handleNpcPlayer(client: Client, reader: EoReader) {
  const packet = NpcPlayerServerPacket.deserialize(reader);
  const unknownNpcsIndexes: Set<number> = new Set();
  for (const position of packet.positions) {
    const npc = client.nearby.npcs.find((n) => position.npcIndex === n.index);
    if (!npc) {
      unknownNpcsIndexes.add(position.npcIndex);
      continue;
    }

    // A dying NPC is being removed; don't move its corpse, and don't let a
    // stray walk overwrite the queued death animation in the per-index slot.
    if (client.animationController.isNpcDying(npc.index)) {
      continue;
    }

    // Queue the authoritative destination in a dedicated map so it's committed
    // at the next drain in lockstep with the walk animation (no early-commit
    // flicker), yet survives the per-index animation slot being overwritten by
    // an attack bundled in the same packet — which would otherwise drop the
    // coords update and leave the NPC attacking from a stale tile.
    client.animationController.pendingNpcCoords.set(npc.index, {
      x: position.coords.x,
      y: position.coords.y,
    });

    client.animationController.pendingNpcAnimations.set(
      npc.index,
      new NpcWalkAnimation(
        getPrevCoords(
          position.coords,
          position.direction,
          client.map.width,
          client.map.height,
        ),
        position.coords,
        position.direction,
      ),
    );
  }

  for (const attack of packet.attacks) {
    if (attack.playerId === client.playerId) {
      client.hp = Math.max(client.hp - attack.damage, 0);
      client.statsController.notifyStatsUpdated();
    }

    const npc = client.nearby.npcs.find((n) => attack.npcIndex === n.index);
    if (!npc) {
      unknownNpcsIndexes.add(attack.npcIndex);
      continue;
    }

    // Skip the corpse's own attack visuals if it's already dying, so the
    // attack animation can't clobber the queued death animation in the
    // per-index slot. The player-side damage above/below still applies — the
    // hit was real on the server.
    if (!client.animationController.isNpcDying(npc.index)) {
      npc.direction = attack.direction;
      client.audioController.playAtPosition(SfxId.PunchAttack, npc.coords);
      client.animationController.pendingNpcAnimations.set(
        npc.index,
        new NpcAttackAnimation(),
      );
    }
    const attackedChar = client.getCharacterById(attack.playerId);
    const attackedCoords = attackedChar?.coords ?? client.getPlayerCoords();
    client.combatOverlayController.setHpBar({
      key: `char:${attack.playerId}`,
      percent: attack.hpPercentage,
      worldX: attackedCoords.x,
      worldY: attackedCoords.y,
    });
    if (attack.damage > 0) {
      const element = eolibToCombatElement(
        client.getEnfRecordById(npc.id)?.element ?? EolibElement.None,
      );
      client.combatOverlayController.pushDamage({
        amount: attack.damage,
        element,
        targetKey: `char:${attack.playerId}`,
        worldX: attackedCoords.x,
        worldY: attackedCoords.y,
      });
    } else {
      client.combatOverlayController.pushMiss({
        targetKey: `char:${attack.playerId}`,
        worldX: attackedCoords.x,
        worldY: attackedCoords.y,
      });
    }

    if (attack.killed === PlayerKilledState.Killed) {
      client.setCharacterDeathAnimation(attack.playerId);
      if (attack.playerId === client.playerId) {
        client.audioController.playById(SfxId.Dead);
      } else {
        const character = client.getCharacterById(attack.playerId);
        if (character) {
          client.audioController.playAtPosition(SfxId.Dead, character.coords);
        }
      }
    }
  }

  for (const chat of packet.chats) {
    const npc = client.nearby.npcs.find((n) => chat.npcIndex === n.index);
    if (!npc) {
      unknownNpcsIndexes.add(chat.npcIndex);
      continue;
    }

    const record = client.getEnfRecordById(npc.id);
    if (!record) {
      continue;
    }

    client.animationController.npcChats.set(
      npc.index,
      new ChatBubble(client.sans11!, chat.message),
    );
  }

  if (unknownNpcsIndexes.size) {
    client.sessionController.requestNpcRange(Array.from(unknownNpcsIndexes));
  }
}

function handleNpcAgree(client: Client, reader: EoReader) {
  const packet = NpcAgreeServerPacket.deserialize(reader);
  for (const npc of packet.npcs) {
    const existing = client.nearby.npcs.find((n) => n.index === npc.index);
    if (existing) {
      if (client.animationController.isNpcDying(existing.index)) {
        continue;
      }
      existing.coords = npc.coords;
      existing.direction = npc.direction;
    } else {
      client.nearby.npcs.push(npc);
    }
  }

  client.atlas.refresh();
}

/**
 * Play a skill's authored `impact_vfx` on a KILLING blow.
 *
 * reoserv's `deal_skill_damage` only broadcasts the FAMILY_SKILL `SkillDamage`
 * packet when the NPC SURVIVES the hit; a fatal one takes the kill/reward path
 * (`attack_npc_killed_reply`) and never sends it. So `handleSkillDamage` —
 * where a non-fatal hit plays `impact_vfx` — never runs for the blow that
 * lands the kill, and the effect was silently lost on exactly the hit you most
 * want it on. That gap has existed since offensive skills predate the VFX
 * layer by five days; nothing ever joined the two up.
 *
 * The client already holds everything needed: `SkillController.use()` arms
 * `pendingImpact` keyed by NPC index at cast time, so both kill handlers can
 * consume it exactly as the damage handler does. Client-only — no server,
 * wire, or pub change.
 *
 * MUST be called BEFORE `setNpcDeathAnimation`: `getEntityWorldSpritePosition`
 * reads the renderer's world-sprite map, and the dying NPC leaves it.
 */
function playKillImpactVfx(
  client: Client,
  npcIndex: number,
  killerId: number,
): void {
  // Only our own casts arm a pending entry, and `takePendingImpact` clears on
  // read — so bail before consuming when someone else landed the kill.
  if (killerId !== client.playerId) return;
  const entry = client.skillController.takePendingImpact(npcIndex);
  if (!entry?.impactVfx) return;
  const targetKey = `npc:${npcIndex}`;
  const pos = client.mapRenderer?.getEntityWorldSpritePosition(targetKey);
  if (!pos) return;
  client.skillVfxController.playBurst(entry.impactVfx, pos.x, pos.y, targetKey);
}

function handleNpcSpec(client: Client, reader: EoReader) {
  const packet = NpcSpecServerPacket.deserialize(reader);
  const specNpc = client.getNpcByIndex(packet.npcKilledData.npcIndex);
  const bundle = () => {
    if (specNpc) {
      client.combatOverlayController.setHpBar({
        key: `npc:${packet.npcKilledData.npcIndex}`,
        percent: 0,
        worldX: specNpc.coords.x,
        worldY: specNpc.coords.y,
      });
      const killerId = packet.npcKilledData.killerId;
      const element =
        killerId === client.playerId
          ? (client.instanceController.list().find((i) => i.equippedSlot === 8)
              ?.element ?? CombatElement.Plain)
          : client.instanceController.weaponElement(killerId);
      const specRecord = client.getEnfRecordById(specNpc.id);
      client.combatOverlayController.pushDamage({
        amount: packet.npcKilledData.damage,
        element,
        effectiveness: specRecord
          ? npcElementEffectiveness(
              element,
              specRecord.element,
              specRecord.elementWeakness,
            )
          : 'neutral',
        targetKey: `npc:${packet.npcKilledData.npcIndex}`,
        worldX: specNpc.coords.x,
        worldY: specNpc.coords.y,
      });
    }

    playKillImpactVfx(
      client,
      packet.npcKilledData.npcIndex,
      packet.npcKilledData.killerId,
    );

    client.setNpcDeathAnimation(packet.npcKilledData.npcIndex);

    if (packet.npcKilledData.dropIndex) {
      const item = new ItemMapInfo();
      item.uid = packet.npcKilledData.dropIndex;
      item.id = packet.npcKilledData.dropId;
      item.coords = packet.npcKilledData.dropCoords;
      item.amount = packet.npcKilledData.dropAmount;
      client.addItemDrop(
        item,
        ITEM_PROTECT_TICKS_NPC,
        packet.npcKilledData.killerId,
      );
      client.atlas.refresh();
    }
  };

  if (
    !client.projectileController.attachOutcome(
      packet.npcKilledData.killerId,
      `npc:${packet.npcKilledData.npcIndex}`,
      bundle,
    )
  ) {
    bundle();
  }

  const gain = packet.experience ? packet.experience - client.experience : 0;
  const message = client.getNpcKilledMessage(packet.npcKilledData, gain);
  if (message) {
    client.toastController.show(message);

    client.chatController.notifyChat({
      message,
      icon: ChatIcon.Star,
      channel: ChatChannels.System,
    });
    client.questController.refreshQuestProgress();
  }

  if (packet.experience) {
    client.experience = packet.experience;
    client.statsController.notifyStatsUpdated();
  }
}

function handleNpcAccept(client: Client, reader: EoReader) {
  const packet = NpcAcceptServerPacket.deserialize(reader);
  const acceptNpc = client.getNpcByIndex(packet.npcKilledData.npcIndex);
  const bundle = () => {
    if (acceptNpc) {
      client.combatOverlayController.setHpBar({
        key: `npc:${packet.npcKilledData.npcIndex}`,
        percent: 0,
        worldX: acceptNpc.coords.x,
        worldY: acceptNpc.coords.y,
      });
      const killerId = packet.npcKilledData.killerId;
      const element =
        killerId === client.playerId
          ? (client.instanceController.list().find((i) => i.equippedSlot === 8)
              ?.element ?? CombatElement.Plain)
          : client.instanceController.weaponElement(killerId);
      const acceptRecord = client.getEnfRecordById(acceptNpc.id);
      client.combatOverlayController.pushDamage({
        amount: packet.npcKilledData.damage,
        element,
        effectiveness: acceptRecord
          ? npcElementEffectiveness(
              element,
              acceptRecord.element,
              acceptRecord.elementWeakness,
            )
          : 'neutral',
        targetKey: `npc:${packet.npcKilledData.npcIndex}`,
        worldX: acceptNpc.coords.x,
        worldY: acceptNpc.coords.y,
      });
    }

    // Same as handleNpcSpec — this is the kill-that-also-levels-you-up variant,
    // and missing it here would drop the effect on exactly those kills.
    playKillImpactVfx(
      client,
      packet.npcKilledData.npcIndex,
      packet.npcKilledData.killerId,
    );

    client.setNpcDeathAnimation(packet.npcKilledData.npcIndex);

    if (packet.npcKilledData.dropIndex) {
      const item = new ItemMapInfo();
      item.uid = packet.npcKilledData.dropIndex;
      item.id = packet.npcKilledData.dropId;
      item.coords = packet.npcKilledData.dropCoords;
      item.amount = packet.npcKilledData.dropAmount;
      client.addItemDrop(
        item,
        ITEM_PROTECT_TICKS_NPC,
        packet.npcKilledData.killerId,
      );
      client.atlas.refresh();
    }
  };

  if (
    !client.projectileController.attachOutcome(
      packet.npcKilledData.killerId,
      `npc:${packet.npcKilledData.npcIndex}`,
      bundle,
    )
  ) {
    bundle();
  }

  client.animationController.characterEmotes.set(
    packet.npcKilledData.killerId,
    new Emote(EmoteType.LevelUp),
  );

  if (packet.npcKilledData.killerId === client.playerId) {
    client.audioController.playById(SfxId.LevelUp);
  } else {
    const coords = client.getCharacterById(
      packet.npcKilledData.killerId,
    )?.coords;
    if (coords) {
      client.audioController.playAtPosition(SfxId.LevelUp, coords);
    }
  }

  if (packet.levelUp) {
    client.level = packet.levelUp.level;
    client.maxHp = packet.levelUp.maxHp;
    client.maxTp = packet.levelUp.maxTp;
    client.maxSp = packet.levelUp.maxSp;
    client.statPoints = packet.levelUp.statPoints;
    client.skillPoints = packet.levelUp.skillPoints;
    // Refresh stat-dependent UI (incl. the unspent-points nav badge) even if
    // no experience field follows below.
    client.statsController.notifyStatsUpdated();
  }

  const gain = packet.experience ? packet.experience - client.experience : 0;
  const message = client.getNpcKilledMessage(
    packet.npcKilledData,
    gain,
    !!packet.levelUp,
  );
  if (message) {
    client.toastController.show(message);
    client.chatController.notifyChat({
      message: message,
      icon: ChatIcon.Star,
      channel: ChatChannels.System,
    });
    client.questController.refreshQuestProgress();
  }

  if (packet.experience) {
    client.experience = packet.experience;
    client.statsController.notifyStatsUpdated();
  }
}

function handleNpcJunk(client: Client, reader: EoReader) {
  const packet = NpcJunkServerPacket.deserialize(reader);
  client.nearby.npcs
    .filter((n) => n.id === packet.npcId)
    .forEach((n) => {
      client.combatOverlayController.setHpBar({
        key: `npc:${n.index}`,
        percent: 0,
        worldX: n.coords.x,
        worldY: n.coords.y,
      });
      client.combatOverlayController.pushDamage({
        amount: 1,
        element: CombatElement.Plain,
        targetKey: `npc:${n.index}`,
        worldX: n.coords.x,
        worldY: n.coords.y,
      });
      client.setNpcDeathAnimation(n.index);
    });
}

function handleNpcDialog(client: Client, reader: EoReader) {
  const packet = NpcDialogServerPacket.deserialize(reader);
  const npc = client.nearby.npcs.find((n) => n.index === packet.npcIndex);
  if (!npc) {
    return;
  }

  const record = client.getEnfRecordById(npc.id);
  if (!record) {
    return;
  }

  client.animationController.npcChats.set(
    npc.index,
    new ChatBubble(client.sans11!, packet.message),
  );
  client.chatController.notifyChat({
    channel: ChatChannels.Local,
    message: `${packet.message}`,
    name: `${capitalize(record.name)}`,
  });
}

function handleNpcReply(client: Client, reader: EoReader) {
  const packet = NpcReplyServerPacket.deserialize(reader);
  const npc = client.nearby.npcs.find((n) => n.index === packet.npcIndex);
  if (!npc) {
    return;
  }

  const record = client.getEnfRecordById(npc.id);
  if (!record) {
    return;
  }

  const bundle = () => {
    client.combatOverlayController.setHpBar({
      key: `npc:${npc.index}`,
      percent: packet.hpPercentage,
      worldX: npc.coords.x,
      worldY: npc.coords.y,
    });
    if (packet.damage > 0) {
      const element =
        packet.playerId === client.playerId
          ? (client.instanceController.list().find((i) => i.equippedSlot === 8)
              ?.element ?? CombatElement.Plain)
          : client.instanceController.weaponElement(packet.playerId);
      client.combatOverlayController.pushDamage({
        amount: packet.damage,
        element,
        effectiveness: npcElementEffectiveness(
          element,
          record.element,
          record.elementWeakness,
        ),
        targetKey: `npc:${npc.index}`,
        worldX: npc.coords.x,
        worldY: npc.coords.y,
      });
    } else {
      client.combatOverlayController.pushMiss({
        targetKey: `npc:${npc.index}`,
        worldX: npc.coords.x,
        worldY: npc.coords.y,
      });
    }
  };

  if (
    !client.projectileController.attachOutcome(
      packet.playerId,
      `npc:${npc.index}`,
      bundle,
    )
  ) {
    bundle();
  }

  if (
    packet.playerId === client.playerId &&
    packet.killStealProtection === NpcKillStealProtectionState.Protected
  ) {
    client.toastController.showWarning(
      client.getResourceString(EOResourceID.STATUS_LABEL_UNABLE_TO_ATTACK),
    );
  }
}

export function registerNpcHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    PacketFamily.Npc,
    PacketAction.Player,
    (reader) => handleNpcPlayer(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Npc,
    PacketAction.Agree,
    (reader) => handleNpcAgree(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Npc,
    PacketAction.Accept,
    (reader) => handleNpcAccept(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Npc,
    PacketAction.Spec,
    (reader) => handleNpcSpec(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Npc,
    PacketAction.Junk,
    (reader) => handleNpcJunk(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Npc,
    PacketAction.Dialog,
    (reader) => handleNpcDialog(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Npc,
    PacketAction.Reply,
    (reader) => handleNpcReply(client, reader),
  );
}
