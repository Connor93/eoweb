import { type EoReader, PacketAction, type PacketFamily } from 'eolib';

import type { Client } from '@/client';

// Custom server family — must match reoserv src/deep/mod.rs FAMILY_RATES.
// Wire: short count; per entry: short player_id, three attack_rate_ms,
// three move_rate_ms.
export const FAMILY_RATES = 55;

function parseEntries(client: Client, reader: EoReader) {
  const count = reader.getShort();
  for (let i = 0; i < count; i++) {
    const playerId = reader.getShort();
    const attackMs = reader.getThree();
    const moveMs = reader.getThree();
    client.playerRates.set(playerId, { attackMs, moveMs });
  }
}

export function registerRatesHandlers(client: Client) {
  // Single-entry broadcast on any player's recompute.
  client.bus!.registerPacketHandler(
    FAMILY_RATES as PacketFamily,
    PacketAction.Agree,
    (reader) => parseEntries(client, reader),
  );
  // Full nearby list on map enter / refresh.
  client.bus!.registerPacketHandler(
    FAMILY_RATES as PacketFamily,
    PacketAction.List,
    (reader) => parseEntries(client, reader),
  );
}
