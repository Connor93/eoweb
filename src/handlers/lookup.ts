import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import type { LookupResult } from '@/controllers';

// Custom deep family for the `#item` / `#npc` lookup reply (mirrors
// REOSERV's `FAMILY_LOOKUP`).
const FAMILY_LOOKUP = 56;

function handleLookupReply(client: Client, reader: EoReader) {
  // The packet body is the whole lookup result as UTF-8 JSON.
  const json = reader.getString();
  let result: LookupResult;
  try {
    result = JSON.parse(json) as LookupResult;
  } catch {
    return;
  }
  client.lookupController.setResult(result);
}

export function registerLookupHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_LOOKUP as PacketFamily,
    PacketAction.Reply,
    (reader) => handleLookupReply(client, reader),
  );
}
