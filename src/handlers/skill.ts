import {
  type Element as EolibElement,
  type EoReader,
  PacketAction,
  type PacketFamily,
} from 'eolib';
import type { Client } from '@/client';
import {
  eolibToCombatElement,
  npcElementEffectiveness,
} from '@/combat-overlay/element-colors';
import type { SkillCatalogEntry } from '@/controllers';

const FAMILY_SKILL = 62;

function readStr(reader: EoReader): string {
  const len = reader.getChar();
  return new TextDecoder().decode(new Uint8Array(reader.getBytes(len)));
}

function handleSkillList(client: Client, reader: EoReader): void {
  const count = reader.getShort();
  const entries: SkillCatalogEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      skillId: readStr(reader),
      name: readStr(reader),
      iconId: readStr(reader),
      costHp: reader.getShort(),
      costTp: reader.getShort(),
      cooldownMs: reader.getInt(),
      target: reader.getChar() === 1 ? 'enemy' : 'self',
      range: reader.getChar(),
    });
  }
  client.skillController.setCatalog(entries);
}

function handleSkillReply(client: Client, reader: EoReader): void {
  const skillId = readStr(reader);
  const ok = reader.getChar() !== 0;
  const reason = reader.getChar();
  const cooldownMs = reader.getInt();
  client.skillController.handleReply(skillId, ok, reason, cooldownMs);
}

function handleSkillDamage(client: Client, reader: EoReader): void {
  const casterId = reader.getShort(); // reserved (future caster VFX)
  const npcIndex = reader.getShort();
  const damage = reader.getInt();
  const hpPercentage = reader.getChar();
  const element = reader.getChar();
  void casterId;

  const npc = client.getNpcByIndex(npcIndex);
  if (!npc) {
    client.sessionController.requestNpcRange([npcIndex]);
    return;
  }
  client.combatOverlayController.setHpBar({
    key: `npc:${npcIndex}`,
    percent: hpPercentage,
    worldX: npc.coords.x,
    worldY: npc.coords.y,
  });
  if (damage > 0) {
    const record = client.getEnfRecordById(npc.id);
    const combatElement = eolibToCombatElement(element as EolibElement);
    client.combatOverlayController.pushDamage({
      amount: damage,
      element: combatElement,
      effectiveness: record
        ? npcElementEffectiveness(
            combatElement,
            record.element,
            record.elementWeakness,
          )
        : 'neutral',
      targetKey: `npc:${npcIndex}`,
      worldX: npc.coords.x,
      worldY: npc.coords.y,
    });
  } else {
    client.combatOverlayController.pushMiss({
      targetKey: `npc:${npcIndex}`,
      worldX: npc.coords.x,
      worldY: npc.coords.y,
    });
  }
}

function handleSkillAugment(client: Client, reader: EoReader): void {
  const npcIndex = reader.getShort();
  client.combatOverlayController.markAugmented(`npc:${npcIndex}`);
}

export function registerSkillHandlers(client: Client): void {
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.List,
    (reader) => handleSkillList(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.Reply,
    (reader) => handleSkillReply(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.Spec,
    (reader) => handleSkillDamage(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.Agree,
    (reader) => handleSkillAugment(client, reader),
  );
}
