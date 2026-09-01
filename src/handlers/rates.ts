import { type EoReader, PacketAction, type PacketFamily } from 'eolib';

import type { Client } from '@/client';

// Custom server family — must match reoserv src/deep/mod.rs FAMILY_RATES.
// Wire: short count; per entry: short player_id, three attack_rate_ms,
// three move_rate_ms, char capped_flags (bit0=attack capped, bit1=move capped).
export const FAMILY_RATES = 55;

function readStr(reader: EoReader): string {
  const len = reader.getChar();
  return new TextDecoder().decode(new Uint8Array(reader.getBytes(len)));
}

function parseEntries(client: Client, reader: EoReader) {
  const count = reader.getShort();
  for (let i = 0; i < count; i++) {
    const playerId = reader.getShort();
    const attackMs = reader.getThree();
    const moveMs = reader.getThree();
    const flags = reader.getChar();
    const attackCapped = (flags & 1) === 1;
    const moveCapped = (flags & 2) === 2;
    client.playerRates.set(playerId, {
      attackMs,
      moveMs,
      attackCapped,
      moveCapped,
    });
    // Re-derive local deadlines immediately so rate buffs feel instant;
    // debuffs apply from the next action (Math.min never extends a gate).
    if (playerId === client.playerId) {
      client.keyboardController.retargetGates(attackMs, moveMs);
    }
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
  // Sparse per-item display list (swing speed + attack range + arrow kind) —
  // sent at map enter / refresh. Each entry carries all three fields; 0/""
  // means "no line" (an unauthored swing speed, a melee range, or the
  // default arrow art), so only store non-default values.
  client.bus!.registerPacketHandler(
    FAMILY_RATES as PacketFamily,
    PacketAction.Reply,
    (reader) => {
      const count = reader.getShort();
      for (let i = 0; i < count; i++) {
        const itemId = reader.getShort();
        const attackMs = reader.getThree();
        const range = reader.getChar();
        const arrowKind = readStr(reader);
        if (attackMs > 0) {
          client.itemAttackRates.set(itemId, attackMs);
        }
        if (range > 0) {
          client.itemAttackRanges.set(itemId, range);
        }
        if (arrowKind) {
          client.itemArrowKinds.set(itemId, arrowKind);
        }
      }
    },
  );
}
