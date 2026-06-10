import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import type { ReputationEntry, ReputationTier } from '@/controllers';

/**
 * REOSERV custom packet family — not in upstream eolib. The server emits
 * PLAYER_REP_LIST (family 53, action List) with the player's full per-
 * zone reputation snapshot on map enter and after every rep delta.
 *
 * Wire format mirrors `src/deep/player_rep_list_server_packet.rs` in
 * REOSERV. Each entry is zone_id (short 2B), value (three 3B), tier
 * (char 1B), then the zone name as a length-prefixed string (char 1B +
 * bytes; empty when zones.json has no entry — fall back to "Zone {id}").
 * The buffer length determines the count; minimum entry size is 7 bytes.
 */
const FAMILY_REPUTATION = 53;
const MIN_ENTRY_BYTES = 7;

function parseRepList(reader: EoReader): ReputationEntry[] {
  const entries: ReputationEntry[] = [];
  while (reader.remaining >= MIN_ENTRY_BYTES) {
    const zoneId = reader.getShort();
    const value = reader.getThree();
    const tier = reader.getChar();
    const nameLen = reader.getChar();
    const nameBytes = reader.getBytes(nameLen);
    const zoneName = new TextDecoder().decode(new Uint8Array(nameBytes));
    entries.push({
      zoneId,
      value,
      tier: tier as ReputationTier,
      zoneName,
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
