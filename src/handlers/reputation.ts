import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import type { ReputationEntry, ReputationTier } from '@/controllers';

/**
 * REOSERV custom packet family — not in upstream eolib. The server emits
 * PLAYER_REP_LIST (family 53, action List) with the player's full per-
 * zone reputation snapshot on map enter and after every rep delta.
 *
 * Wire format mirrors `src/deep/player_rep_list_server_packet.rs` in
 * REOSERV. Each entry is exactly 6 bytes: zone_id (short 2B), value
 * (three 3B), tier (char 1B). The buffer length determines the count.
 */
const FAMILY_REPUTATION = 53;
const ENTRY_BYTES = 6;

function parseRepList(reader: EoReader): ReputationEntry[] {
  const entries: ReputationEntry[] = [];
  while (reader.remaining >= ENTRY_BYTES) {
    const zoneId = reader.getShort();
    const value = reader.getThree();
    const tier = reader.getChar();
    entries.push({
      zoneId,
      value,
      tier: tier as ReputationTier,
    });
  }
  return entries;
}

function handleRepList(client: Client, reader: EoReader) {
  const entries = parseRepList(reader);
  client.reputationController.setEntries(entries);
}

export function registerReputationHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_REPUTATION as PacketFamily,
    PacketAction.List,
    (reader) => handleRepList(client, reader),
  );
}
