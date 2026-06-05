import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import type { InstanceItem, InstanceMod, InstanceRarity } from '@/controllers';

/**
 * REOSERV custom packet family — not in upstream eolib. INSTANCE_LIST
 * (family 54, action List) carries the player's full rolled-instance
 * snapshot. Wire format mirrors `src/deep/instance_list_server_packet.rs`
 * in REOSERV:
 *
 *   short  entry_count
 *     -- per entry --
 *     bytes  instance_id     (36 raw ASCII chars — UUID hyphenated)
 *     short  base_item_id
 *     char   rarity_tier     (0=common, 1=rare, 2=epic, 3=legendary)
 *     char   level
 *     char   mod_count
 *       -- per mod --
 *       char   mod_id_len
 *       bytes  mod_id        (mod_id_len bytes)
 *       int    value_x100    (f32 × 100, rounded)
 */
const FAMILY_INSTANCE = 54;
const INSTANCE_ID_LEN = 36;
const LOCATION_SENTINEL_LOCKER = 251;
const LOCATION_SENTINEL_INVENTORY = 252;

function parseInstanceList(reader: EoReader): InstanceItem[] {
  const count = reader.getShort();
  const entries: InstanceItem[] = [];
  for (let i = 0; i < count; i++) {
    const instanceId = reader.getFixedString(INSTANCE_ID_LEN).trim();
    const baseItemId = reader.getShort();
    const rarity = reader.getChar() as InstanceRarity;
    const level = reader.getChar();
    const locationRaw = reader.getChar();
    let equippedSlot = -1;
    let inLocker = false;
    if (locationRaw === LOCATION_SENTINEL_LOCKER) {
      inLocker = true;
    } else if (locationRaw !== LOCATION_SENTINEL_INVENTORY) {
      equippedSlot = locationRaw;
    }
    const modCount = reader.getChar();
    const mods: InstanceMod[] = [];
    for (let j = 0; j < modCount; j++) {
      const modIdLen = reader.getChar();
      const modIdBytes = reader.getBytes(modIdLen);
      const modId = new TextDecoder().decode(new Uint8Array(modIdBytes));
      const valueX100 = reader.getInt();
      mods.push({ modId, value: valueX100 / 100 });
    }
    entries.push({
      instanceId,
      baseItemId,
      rarity,
      level,
      equippedSlot,
      inLocker,
      mods,
    });
  }
  return entries;
}

function handleInstanceList(client: Client, reader: EoReader) {
  const entries = parseInstanceList(reader);
  client.instanceController.setItems(entries);
}

export function registerInstanceHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_INSTANCE as PacketFamily,
    PacketAction.List,
    (reader) => handleInstanceList(client, reader),
  );
}
