import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
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
}
