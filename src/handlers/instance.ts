import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import type { CombatElement } from '@/combat-overlay/element-colors';
import type {
  GroundInstanceItem,
  InstanceItem,
  InstanceMod,
  InstanceRarity,
} from '@/controllers';

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
 *       char   name_len
 *       bytes  name          (name_len bytes)
 *       char   kind          (0=flat, 1=percent_additive, 2=percent_multiplicative)
 *       char   target_len
 *       bytes  target        (target_len bytes)
 *       char   sign          (0=positive, 1=negative)
 *       int    value_x100    (abs(f32 × 100), rounded)
 *       char   condition_len
 *       bytes  condition     (condition_len bytes; empty = unconditional)
 */
const FAMILY_INSTANCE = 54;
const INSTANCE_ID_LEN = 36;
const LOCATION_SENTINEL_LOCKER = 251;
const LOCATION_SENTINEL_INVENTORY = 252;

function readMod(reader: EoReader): InstanceMod {
  const modIdLen = reader.getChar();
  const modIdBytes = reader.getBytes(modIdLen);
  const modId = new TextDecoder().decode(new Uint8Array(modIdBytes));
  const nameLen = reader.getChar();
  const nameBytes = reader.getBytes(nameLen);
  const name = new TextDecoder().decode(new Uint8Array(nameBytes));
  const kind = reader.getChar();
  const targetLen = reader.getChar();
  const targetBytes = reader.getBytes(targetLen);
  const target = new TextDecoder().decode(new Uint8Array(targetBytes));
  // Sign byte (0 = +, 1 = −): eolib ints can't encode negatives, and
  // resist mods roll negative values.
  const negative = reader.getChar() === 1;
  const valueX100 = reader.getInt() * (negative ? -1 : 1);
  const conditionLen = reader.getChar();
  const conditionBytes = reader.getBytes(conditionLen);
  const condition = new TextDecoder().decode(new Uint8Array(conditionBytes));
  return { modId, name, kind, target, value: valueX100 / 100, condition };
}

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
      mods.push(readMod(reader));
    }
    const element = reader.getChar() as CombatElement;
    entries.push({
      instanceId,
      baseItemId,
      rarity,
      level,
      element,
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

/** Parses a `ChestInstanceListServerPacket` (family 54 / action Open).
 *  Same per-entry shape as INSTANCE_LIST minus the location byte —
 *  chest contents are inherently floor-pile state. */
function parseChestInstanceList(reader: EoReader): InstanceItem[] {
  const count = reader.getShort();
  const entries: InstanceItem[] = [];
  for (let i = 0; i < count; i++) {
    const instanceId = reader.getFixedString(INSTANCE_ID_LEN).trim();
    const baseItemId = reader.getShort();
    const rarity = reader.getChar() as InstanceRarity;
    const level = reader.getChar();
    const modCount = reader.getChar();
    const mods: InstanceMod[] = [];
    for (let j = 0; j < modCount; j++) {
      mods.push(readMod(reader));
    }
    const element = reader.getChar() as CombatElement;
    entries.push({
      instanceId,
      baseItemId,
      rarity,
      level,
      element,
      equippedSlot: -1,
      inLocker: false,
      mods,
    });
  }
  return entries;
}

function handleChestInstanceList(client: Client, reader: EoReader) {
  const entries = parseChestInstanceList(reader);
  client.chestController.handleInstancesUpdated(entries);
}

/** Parses the TradeInstanceListServerPacket — two TradeInstanceSides,
 *  each (player_id, [chest-shaped entries]). The order of the two
 *  sides isn't fixed; the controller identifies which is "me" by
 *  matching the player id. */
function parseTradeInstanceList(reader: EoReader) {
  const sides: { playerId: number; instances: InstanceItem[] }[] = [];
  for (let s = 0; s < 2; s++) {
    const playerId = reader.getShort();
    const count = reader.getShort();
    const instances: InstanceItem[] = [];
    for (let i = 0; i < count; i++) {
      const instanceId = reader.getFixedString(INSTANCE_ID_LEN).trim();
      const baseItemId = reader.getShort();
      const rarity = reader.getChar() as InstanceRarity;
      const level = reader.getChar();
      const modCount = reader.getChar();
      const mods: InstanceMod[] = [];
      for (let j = 0; j < modCount; j++) {
        mods.push(readMod(reader));
      }
      const element = reader.getChar() as CombatElement;
      instances.push({
        instanceId,
        baseItemId,
        rarity,
        level,
        element,
        equippedSlot: -1,
        inLocker: false,
        mods,
      });
    }
    sides.push({ playerId, instances });
  }
  return sides;
}

function handleTradeInstanceList(client: Client, reader: EoReader) {
  const sides = parseTradeInstanceList(reader);
  client.tradeController.notifyInstancesUpdated(sides);
}

/** Parses INSTANCE_GROUND_ADD (family 54 / action Spec). One ground-
 *  item's instance metadata so the renderer can tint the sprite. The
 *  matching ItemRemove tears the cache entry back down. */
function parseInstanceGroundAdd(reader: EoReader): GroundInstanceItem {
  const itemIndex = reader.getShort();
  const instanceId = reader.getFixedString(INSTANCE_ID_LEN).trim();
  const baseItemId = reader.getShort();
  const rarity = reader.getChar() as InstanceRarity;
  const level = reader.getChar();
  const modCount = reader.getChar();
  const mods: InstanceMod[] = [];
  for (let j = 0; j < modCount; j++) {
    mods.push(readMod(reader));
  }
  const element = reader.getChar() as CombatElement;
  return { itemIndex, instanceId, baseItemId, rarity, level, element, mods };
}

function handleInstanceGroundAdd(client: Client, reader: EoReader) {
  const entry = parseInstanceGroundAdd(reader);
  client.instanceController.setGroundInstance(entry);
}

function handlePlayerPaperdoll(client: Client, reader: EoReader) {
  const playerId = reader.getShort();
  const element = reader.getChar() as CombatElement;
  client.instanceController.setWeaponElement(playerId, element);
}

export function registerInstanceHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_INSTANCE as PacketFamily,
    PacketAction.List,
    (reader) => handleInstanceList(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_INSTANCE as PacketFamily,
    PacketAction.Open,
    (reader) => handleChestInstanceList(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_INSTANCE as PacketFamily,
    PacketAction.Reply,
    (reader) => handleTradeInstanceList(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_INSTANCE as PacketFamily,
    PacketAction.Spec,
    (reader) => handleInstanceGroundAdd(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_INSTANCE as PacketFamily,
    PacketAction.Player,
    (reader) => handlePlayerPaperdoll(client, reader),
  );
}
