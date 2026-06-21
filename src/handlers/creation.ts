import { type EoReader, PacketAction, type PacketFamily } from 'eolib';

import type { Client } from '@/client';

// Custom server family — must match reoserv src/deep/mod.rs FAMILY_CREATION.
// Wire: short count, then `count` shorts (playable class ids). Pushed after
// login and re-broadcast on pub reload; drives the create screen's class picker.
export const FAMILY_CREATION = 57;

export function registerCreationHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_CREATION as PacketFamily,
    PacketAction.Reply,
    (reader: EoReader) => {
      const count = reader.getShort();
      const ids: number[] = [];
      for (let i = 0; i < count; i++) {
        ids.push(reader.getShort());
      }
      client.playableClasses = ids;
    },
  );
}
