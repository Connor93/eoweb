import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';

/**
 * REOSERV custom packet family — not in upstream eolib. The server emits
 * BOSS_PING (family 52, action Ping) when a client enters a map or
 * requests a refresh and a boss NPC is alive in their range, and again
 * with `killed=true` when the boss dies.
 *
 * Wire format mirrors `src/deep/boss_ping_server_packet.rs` in REOSERV.
 */
const FAMILY_BOSS = 52;

interface ParsedBossPing {
  npcIndex: number;
  npcId: number;
  hp: number;
  hpPercentage: number;
  killed: boolean;
}

function parseBossPing(reader: EoReader): ParsedBossPing {
  // npc_index: short, npc_id: short, hp: three (3-byte), hp_percentage: char, killed: char
  return {
    npcIndex: reader.getShort(),
    npcId: reader.getShort(),
    hp: reader.getThree(),
    hpPercentage: reader.getChar(),
    killed: reader.getChar() === 1,
  };
}

function handleBossPing(client: Client, reader: EoReader) {
  const ping = parseBossPing(reader);
  client.bossController.applyPing(ping);
}

export function registerBossHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_BOSS as PacketFamily,
    PacketAction.Ping,
    (reader) => handleBossPing(client, reader),
  );
}
