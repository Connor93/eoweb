import {
  type EoReader,
  PacketAction,
  PacketFamily,
  ShopBuyServerPacket,
  ShopCreateServerPacket,
  ShopOpenServerPacket,
  ShopSellServerPacket,
} from 'eolib';
import type { Client } from '@/client';
import type { CombatElement } from '@/combat-overlay/element-colors';
import type {
  InstanceMod,
  InstanceModKind,
  InstanceRarity,
  ShopStockItem,
} from '@/controllers';

/**
 * REOSERV custom packet family — not in upstream eolib. SHOP_STOCK
 * (family 58, action List) carries the shop's pre-rolled gacha stock,
 * pushed right after ShopOpen and again on every restock. Wire format
 * mirrors `src/deep/shop_stock_server_packet.rs` in REOSERV:
 *
 *   short  entry_count
 *     -- per entry --
 *     short  item_id
 *     int    price
 *     char   rarity
 *     char   level
 *     char   mod_count
 *       -- per mod, same shape as readMod in src/handlers/instance.ts --
 *       char   mod_id_len
 *       bytes  mod_id
 *       char   name_len
 *       bytes  name
 *       char   kind
 *       char   target_len
 *       bytes  target
 *       char   sign          (0=positive, 1=negative)
 *       int    value_x100
 *       char   condition_len
 *       bytes  condition
 *     char   element
 */
const FAMILY_SHOP_STOCK = 58;

function readStockMod(reader: EoReader): InstanceMod {
  const modIdLen = reader.getChar();
  const modIdBytes = reader.getBytes(modIdLen);
  const modId = new TextDecoder().decode(new Uint8Array(modIdBytes));
  const nameLen = reader.getChar();
  const nameBytes = reader.getBytes(nameLen);
  const name = new TextDecoder().decode(new Uint8Array(nameBytes));
  const kind = reader.getChar() as InstanceModKind;
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

function parseShopStock(reader: EoReader): ShopStockItem[] {
  const count = reader.getShort();
  const items: ShopStockItem[] = [];
  for (let i = 0; i < count; i++) {
    const itemId = reader.getShort();
    const price = reader.getInt();
    const rarity = reader.getChar() as InstanceRarity;
    const level = reader.getChar();
    const modCount = reader.getChar();
    const mods: InstanceMod[] = [];
    for (let j = 0; j < modCount; j++) {
      mods.push(readStockMod(reader));
    }
    const element = reader.getChar() as CombatElement;
    items.push({ itemId, price, rarity, level, element, mods });
  }
  return items;
}

function handleShopStock(client: Client, reader: EoReader) {
  const items = parseShopStock(reader);
  client.shopController.handleStockUpdated(items);
}

function handleShopOpen(client: Client, reader: EoReader) {
  const packet = ShopOpenServerPacket.deserialize(reader);
  client.shopController.handleOpened(
    packet.sessionId,
    packet.shopName,
    packet.tradeItems,
    packet.craftItems,
  );
}

function handleShopBuy(client: Client, reader: EoReader) {
  const packet = ShopBuyServerPacket.deserialize(reader);
  client.shopController.notifyBought(
    packet.goldAmount,
    packet.boughtItem,
    packet.weight.current,
  );
}

function handleShopSell(client: Client, reader: EoReader) {
  const packet = ShopSellServerPacket.deserialize(reader);
  client.shopController.notifySold(
    packet.soldItem,
    packet.goldAmount,
    packet.weight.current,
  );
}

function handleShopCreate(client: Client, reader: EoReader) {
  const packet = ShopCreateServerPacket.deserialize(reader);
  client.shopController.notifyCrafted(
    packet.craftItemId,
    packet.ingredients,
    packet.weight.current,
  );
}

export function registerShopHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    PacketFamily.Shop,
    PacketAction.Open,
    (reader) => handleShopOpen(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Shop,
    PacketAction.Buy,
    (reader) => handleShopBuy(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Shop,
    PacketAction.Sell,
    (reader) => handleShopSell(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Shop,
    PacketAction.Create,
    (reader) => handleShopCreate(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_SHOP_STOCK as PacketFamily,
    PacketAction.List,
    (reader) => handleShopStock(client, reader),
  );
}
