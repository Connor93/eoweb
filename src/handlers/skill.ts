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

/** Catalog target code → entry target. An unknown code must never fall
 *  through to 'self', which the hotbar casts instantly. */
function decodeTarget(code: number): SkillCatalogEntry['target'] {
  switch (code) {
    case 0:
      return 'self';
    case 1:
      return 'enemy';
    case 2:
      return 'ground';
    default:
      return 'unknown';
  }
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
      target: decodeTarget(reader.getChar()),
      range: reader.getChar(),
      castVfx: readStr(reader),
      impactVfx: readStr(reader),
      classRequirement: reader.getShort(),
      minLevel: reader.getChar(),
      skillPointCost: reader.getShort(),
      // Trailing field — must stay last, mirroring the server's serialize
      // order in deep/skill_list_server_packet.rs.
      description: readStr(reader),
      // Ground-area fields trail `description` (server serialize order).
      areaRadius: reader.getChar(),
      areaThrowBlocked: reader.getChar() !== 0,
    });
  }
  client.skillController.setCatalog(entries);
}

function handleSkillKnown(client: Client, reader: EoReader): void {
  const count = reader.getShort();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(readStr(reader));
  const points = reader.getInt();
  client.skillController.setKnown(ids, points);
}

function handleSkillLearnReply(client: Client, reader: EoReader): void {
  // Wire order deliberately differs from the server struct's field order:
  // skill_id, ok, reason, skill_points_remaining.
  const skillId = readStr(reader);
  const ok = reader.getChar() !== 0;
  const reason = reader.getChar();
  const remaining = reader.getInt();
  client.skillController.applyLearnReply(ok, reason, skillId, remaining);
}

function handleSkillReply(client: Client, reader: EoReader): void {
  const skillId = readStr(reader);
  const ok = reader.getChar() !== 0;
  const reason = reader.getChar();
  const cooldownMs = reader.getInt();
  client.skillController.handleReply(skillId, ok, reason, cooldownMs);
}

/**
 * Server broadcasts this to everyone near the caster (caster included) on
 * every successful cast, before damage resolves — so every client plays the
 * cast VFX on the caster and the impact VFX on the target, and the target is
 * still on screen even when this cast kills it.
 */
/** Wire: caster short, skill id, tile x/y chars, hit count char, then one
 *  short per NPC hit (deep/skill_cast_server_packet.rs). Impacts play only on
 *  the listed NPCs — never on the tile itself. */
function handleSkillCast(client: Client, reader: EoReader): void {
  const casterId = reader.getShort();
  const skillId = readStr(reader);
  reader.getChar(); // aimed tile x — unused until persistent ground effects
  reader.getChar(); // aimed tile y
  const hitCount = reader.getChar();
  const hits: number[] = [];
  for (let i = 0; i < hitCount; i++) hits.push(reader.getShort());
  const entry = client.skillController.entryOf(skillId);
  if (!entry) return;

  playVfxOn(client, entry.castVfx, `char:${casterId}`);
  for (const npcIndex of hits) {
    playVfxOn(client, entry.impactVfx, `npc:${npcIndex}`);
  }
}

/** SkillZoneAdd (62 / Open): a lasting ground area started, or one already
 *  running on the map we just entered. Wire: zone id short, skill id, centre
 *  x/y chars, radius char, blast-blocked char, element char, remaining ms int
 *  (deep/skill_zone_add_server_packet.rs). */
function handleSkillZoneAdd(client: Client, reader: EoReader): void {
  const id = reader.getShort();
  const skillId = readStr(reader);
  const center = { x: reader.getChar(), y: reader.getChar() };
  const radius = reader.getChar();
  const blastBlocked = reader.getChar() !== 0;
  const element = reader.getChar();
  const remainingMs = reader.getInt();
  client.groundZoneController.add(
    { id, skillId, center, radius, blastBlocked, element, remainingMs },
    performance.now(),
  );
}

/** SkillZoneRemove (62 / Close): the zone expired or its caster left. */
function handleSkillZoneRemove(client: Client, reader: EoReader): void {
  client.groundZoneController.remove(reader.getShort());
}

/** SkillPulse (62 / Report): one wave of a lasting ground area. Flashes the
 *  zone's glow and plays the impact VFX on each NPC hit — never a cast VFX,
 *  and never on a tile. Wire: zone id short, skill id, hit count char, then
 *  one short per hit (deep/skill_pulse_server_packet.rs). */
function handleSkillPulse(client: Client, reader: EoReader): void {
  const zoneId = reader.getShort();
  const skillId = readStr(reader);
  const hitCount = reader.getChar();
  const hits: number[] = [];
  for (let i = 0; i < hitCount; i++) hits.push(reader.getShort());
  client.groundZoneController.pulse(zoneId, performance.now());
  const entry = client.skillController.entryOf(skillId);
  if (!entry) return;
  for (const npcIndex of hits) {
    playVfxOn(client, entry.impactVfx, `npc:${npcIndex}`);
  }
}

/** Play `ref` on the entity `key`; skipped if unset or the entity isn't drawn. */
function playVfxOn(client: Client, ref: string, key: string): void {
  if (!ref) return;
  const pos = client.mapRenderer?.getEntityWorldSpritePosition(key);
  if (!pos) return;
  client.skillVfxController.playBurst(ref, pos.x, pos.y, key);
}

function handleSkillDamage(client: Client, reader: EoReader): void {
  reader.getShort(); // caster id — impact VFX now comes from SkillCast
  const npcIndex = reader.getShort();
  const damage = reader.getInt();
  const hpPercentage = reader.getChar();
  const element = reader.getChar();

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
    PacketAction.Use,
    (reader) => handleSkillCast(client, reader),
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
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.Player,
    (reader) => handleSkillKnown(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.Accept,
    (reader) => handleSkillLearnReply(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.Open,
    (reader) => handleSkillZoneAdd(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.Close,
    (reader) => handleSkillZoneRemove(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_SKILL as PacketFamily,
    PacketAction.Report,
    (reader) => handleSkillPulse(client, reader),
  );
}
