import { type EoReader, PacketAction, type PacketFamily } from 'eolib';

import type { Client } from '@/client';

// Custom server family — must match reoserv src/deep/mod.rs
// FAMILY_STAT_EFFECTS. Wire: short row_count; per row: char len + bytes row,
// char entry_count; per entry: char len + bytes key, char sign (0 = +,
// 1 = −), int abs value_x100.
export const FAMILY_STAT_EFFECTS = 64;

export function registerStatEffectsHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_STAT_EFFECTS as PacketFamily,
    PacketAction.Agree,
    (reader: EoReader) => {
      // Char-length-prefixed strings are read the way readMod does it in
      // src/handlers/instance.ts — getBytes + TextDecoder, not
      // getFixedString (which is for fixed-width ids).
      const readStr = (): string => {
        const len = reader.getChar();
        return new TextDecoder().decode(new Uint8Array(reader.getBytes(len)));
      };

      const rowCount = reader.getShort();
      const next = new Map<string, Array<{ key: string; value: number }>>();
      for (let i = 0; i < rowCount; i++) {
        const row = readStr();
        const entryCount = reader.getChar();
        const entries: Array<{ key: string; value: number }> = [];
        for (let j = 0; j < entryCount; j++) {
          const key = readStr();
          // eolib ints can't carry a negative; the sign is its own byte.
          const negative = reader.getChar() === 1;
          const magnitude = reader.getInt();
          entries.push({
            key,
            value: (negative ? -magnitude : magnitude) / 100,
          });
        }
        next.set(row, entries);
      }
      // Replace wholesale: the server always sends the complete set, so a
      // row that stops being emitted must stop being displayed.
      client.statEffects = next;
      client.notifyStatEffectsChanged();
    },
  );
}
