import {
  Emote as EmoteType,
  type EoReader,
  PacketAction,
  PacketFamily,
  RecoverAgreeServerPacket,
  RecoverListServerPacket,
  RecoverPlayerServerPacket,
  RecoverReplyServerPacket,
  RecoverTargetGroupServerPacket,
} from 'eolib';
import type { Client } from '@/client';
import { Emote } from '@/render';
import { SfxId } from '@/sfx';

function handleRecoverPlayer(client: Client, reader: EoReader) {
  const packet = RecoverPlayerServerPacket.deserialize(reader);

  if (client.hp !== packet.hp) {
    const amount = packet.hp - client.hp;
    const percentage = (packet.hp / client.maxHp) * 100;
    client.hp = packet.hp;
    const recoverPlayerCoords = client.getPlayerCoords();
    client.combatOverlayController.setHpBar({
      key: `char:${client.playerId}`,
      percent: percentage,
      worldX: recoverPlayerCoords.x,
      worldY: recoverPlayerCoords.y,
      remainingTicks: 4,
    });
    client.combatOverlayController.pushHeal({
      amount,
      worldX: recoverPlayerCoords.x,
      worldY: recoverPlayerCoords.y,
    });
  }

  client.tp = packet.tp;
  client.statsController.notifyStatsUpdated();
}

function handleRecoverAgree(client: Client, reader: EoReader) {
  const packet = RecoverAgreeServerPacket.deserialize(reader);
  const character = client.getCharacterById(packet.playerId);
  if (!character) {
    client.sessionController.requestCharacterRange([packet.playerId]);
    return;
  }

  character.hp += packet.healHp;
  client.combatOverlayController.setHpBar({
    key: `char:${packet.playerId}`,
    percent: packet.hpPercentage,
    worldX: character.coords.x,
    worldY: character.coords.y,
    remainingTicks: 4,
  });
  client.combatOverlayController.pushHeal({
    amount: packet.healHp,
    worldX: character.coords.x,
    worldY: character.coords.y,
  });
}

function handleRecoverList(client: Client, reader: EoReader) {
  const packet = RecoverListServerPacket.deserialize(reader);
  client.baseStats.str = packet.stats.baseStats.str;
  client.baseStats.intl = packet.stats.baseStats.intl;
  client.baseStats.wis = packet.stats.baseStats.wis;
  client.baseStats.agi = packet.stats.baseStats.agi;
  client.baseStats.cha = packet.stats.baseStats.cha;
  client.baseStats.con = packet.stats.baseStats.con;
  client.secondaryStats.accuracy = packet.stats.secondaryStats.accuracy;
  client.secondaryStats.armor = packet.stats.secondaryStats.armor;
  client.secondaryStats.evade = packet.stats.secondaryStats.evade;
  client.secondaryStats.minDamage = packet.stats.secondaryStats.minDamage;
  client.secondaryStats.maxDamage = packet.stats.secondaryStats.maxDamage;
  client.maxHp = packet.stats.maxHp;
  client.maxTp = packet.stats.maxTp;
  client.maxSp = packet.stats.maxSp;
  client.classId = packet.classId;
  client.weight.max = packet.stats.maxWeight;
  client.hp = Math.min(client.hp, client.maxHp);
  client.tp = Math.min(client.tp, client.maxTp);
  client.statsController.notifyStatsUpdated();
}

function handleRecoverReply(client: Client, reader: EoReader) {
  const packet = RecoverReplyServerPacket.deserialize(reader);
  client.karma = packet.karma;
  client.experience = packet.experience;

  if (packet.levelUp) {
    client.animationController.characterEmotes.set(
      client.playerId,
      new Emote(EmoteType.LevelUp),
    );
    client.audioController.playById(SfxId.LevelUp);
    client.level = packet.levelUp;
    client.statPoints = packet.statPoints!;
    client.skillPoints = packet.skillPoints!;
  }
}

function handleRecoverTargetGroup(client: Client, reader: EoReader) {
  const packet = RecoverTargetGroupServerPacket.deserialize(reader);
  client.maxHp = packet.maxHp;
  client.maxTp = packet.maxTp;
  client.maxSp = packet.maxSp;
  client.statPoints = packet.statPoints;
  client.skillPoints = packet.skillPoints;
  client.statsController.notifyStatsUpdated();
}

export function registerRecoverHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    PacketFamily.Recover,
    PacketAction.Player,
    (reader) => handleRecoverPlayer(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Recover,
    PacketAction.Agree,
    (reader) => handleRecoverAgree(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Recover,
    PacketAction.List,
    (reader) => handleRecoverList(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Recover,
    PacketAction.Reply,
    (reader) => handleRecoverReply(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Recover,
    PacketAction.TargetGroup,
    (reader) => handleRecoverTargetGroup(client, reader),
  );
}
