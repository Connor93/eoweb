import {
  Item,
  ShopBuyClientPacket,
  type ShopCraftItem,
  ShopCreateClientPacket,
  ShopSellClientPacket,
  type ShopSoldItem,
  type ShopTradeItem,
} from 'eolib';
import type { Client } from '@/client';
import type { CombatElement } from '@/combat-overlay/element-colors';
import { GOLD_ITEM_ID } from '@/consts';
import { EOResourceID } from '@/edf';
import { SfxId } from '@/sfx';
import { ChatIcon } from '@/ui/enums';
import type { InstanceMod, InstanceRarity } from './instance-controller';

type OpenedSubscriber = (
  name: string,
  tradeItems: ShopTradeItem[],
  craftItems: ShopCraftItem[],
) => void;
type ChangedSubscriber = () => void;

export interface ShopStockItem {
  itemId: number;
  price: number;
  rarity: InstanceRarity;
  level: number;
  element: CombatElement;
  mods: InstanceMod[];
}

export class ShopController {
  private client: Client;
  shopName = '';
  tradeItems: ShopTradeItem[] = [];
  craftItems: ShopCraftItem[] = [];
  /** Pre-rolled modded instances backing this shop's trade slots.
   *  Populated by the family-58 shop-stock packet, which arrives right
   *  after `ShopOpen` and repopulates on every restock. */
  tradeInstances: ShopStockItem[] = [];

  private openedSubscribers: OpenedSubscriber[] = [];
  private changedSubscribers: ChangedSubscriber[] = [];
  private stockSubscribers: (() => void)[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  subscribeOpened(cb: OpenedSubscriber): void {
    this.openedSubscribers.push(cb);
  }

  unsubscribeOpened(cb: OpenedSubscriber): void {
    this.openedSubscribers = this.openedSubscribers.filter((s) => s !== cb);
  }

  subscribeChanged(cb: ChangedSubscriber): void {
    this.changedSubscribers.push(cb);
  }

  unsubscribeChanged(cb: ChangedSubscriber): void {
    this.changedSubscribers = this.changedSubscribers.filter((s) => s !== cb);
  }

  subscribeStockChanged(cb: () => void): void {
    this.stockSubscribers.push(cb);
  }

  unsubscribeStockChanged(cb: () => void): void {
    this.stockSubscribers = this.stockSubscribers.filter((s) => s !== cb);
  }

  handleStockUpdated(items: ShopStockItem[]): void {
    this.tradeInstances = items;
    for (const cb of this.stockSubscribers) cb();
  }

  stockFor(itemId: number): ShopStockItem | undefined {
    return this.tradeInstances.find((s) => s.itemId === itemId);
  }

  handleOpened(
    sessionId: number,
    shopName: string,
    tradeItems: ShopTradeItem[],
    craftItems: ShopCraftItem[],
  ): void {
    this.client.sessionId = sessionId;
    this.shopName = shopName;
    this.tradeItems = tradeItems;
    this.craftItems = craftItems;
    this.tradeInstances = [];

    for (const cb of this.openedSubscribers)
      cb(shopName, tradeItems, craftItems);
  }

  notifyBought(
    goldAmount: number,
    boughtItem: Item,
    weightCurrent: number,
  ): void {
    this.client.inventoryController.setItem(GOLD_ITEM_ID, goldAmount);
    if (boughtItem.amount > 0) {
      this.client.inventoryController.addItem(boughtItem.id, boughtItem.amount);
    }
    this.client.weight.current = weightCurrent;
    this.client.audioController.playById(SfxId.BuySell);
    for (const cb of this.changedSubscribers) cb();

    if (boughtItem.amount > 0) {
      const name = this.client.getEifRecordById(boughtItem.id)?.name ?? '';
      const msg = this.client.locale.shop.boughtMsg
        .replace('{amount}', String(boughtItem.amount))
        .replace('{name}', name);
      this.client.toastController.show(msg);
      this.client.chatController.notifyServerChat({
        message: msg,
        icon: ChatIcon.Star,
      });
    }
  }

  notifySold(
    soldItem: ShopSoldItem,
    goldAmount: number,
    weightCurrent: number,
  ): void {
    this.client.inventoryController.setItem(GOLD_ITEM_ID, goldAmount);

    const prevAmount = this.client.inventoryController.getItemAmount(
      soldItem.id,
    );
    this.client.inventoryController.setItem(soldItem.id, soldItem.amount);
    this.client.weight.current = weightCurrent;
    this.client.audioController.playById(SfxId.BuySell);
    for (const cb of this.changedSubscribers) cb();

    const soldAmount = prevAmount - (soldItem.amount ?? 0);
    const name = this.client.getEifRecordById(soldItem.id)?.name ?? '';
    const msg = this.client.locale.shop.soldMsg
      .replace('{amount}', String(soldAmount > 0 ? soldAmount : 1))
      .replace('{name}', name);
    this.client.toastController.show(msg);
    this.client.chatController.notifyServerChat({
      message: msg,
      icon: ChatIcon.DownArrow,
    });
  }

  notifyCrafted(
    craftItemId: number,
    ingredients: Item[],
    weightCurrent: number,
  ): void {
    for (const ingredient of ingredients) {
      if (!ingredient.id) continue;
      this.client.inventoryController.setItem(ingredient.id, ingredient.amount);
    }

    this.client.inventoryController.addItem(craftItemId);
    this.client.weight.current = weightCurrent;
    this.client.audioController.playById(SfxId.Craft);
    for (const cb of this.changedSubscribers) cb();

    const name = this.client.getEifRecordById(craftItemId)?.name ?? '';
    const msg = this.client.locale.shop.craftedMsg.replace('{name}', name);
    this.client.toastController.showSuccess(msg);
    this.client.chatController.notifyServerChat({
      message: msg,
      icon: ChatIcon.Trophy,
    });
  }

  buyItem(itemId: number, maxAmount: number): void {
    if (maxAmount <= 0) return;

    const send = (amount: number) => {
      if (amount <= 0 || amount > maxAmount) return;
      this.sendBuyItem(itemId, amount);
    };

    if (maxAmount > 1) {
      const title = this.client.getResourceString(
        EOResourceID.DIALOG_TRANSFER_HOW_MUCH,
      );
      this.client.alertController.showAmount(
        title,
        this.getItemName(itemId),
        maxAmount,
        this.client.locale.shop.buyAction,
        (amount) => {
          if (amount !== null) send(amount);
        },
        this.client.locale.shop.buyAgainAction,
      );
      return;
    }

    send(1);
  }

  sellItem(itemId: number, maxAmount: number): void {
    if (maxAmount <= 0) return;

    const send = (amount: number) => {
      if (amount <= 0 || amount > maxAmount) return;
      this.sendSellItem(itemId, amount);
    };

    if (maxAmount > 1) {
      const title = this.client.getResourceString(
        EOResourceID.DIALOG_TRANSFER_HOW_MUCH,
      );
      this.client.alertController.showAmount(
        title,
        this.getItemName(itemId),
        maxAmount,
        this.client.locale.shop.sellAction,
        (amount) => {
          if (amount !== null) send(amount);
        },
      );
      return;
    }

    send(1);
  }

  sellAllItem(itemId: number): void {
    const amount = this.client.inventoryController.getItemAmount(itemId);
    if (amount <= 0) return;
    this.sendSellItem(itemId, amount);
  }

  canCraft(item: ShopCraftItem): boolean {
    for (const ingredient of item.ingredients) {
      if (!ingredient.id || ingredient.amount <= 0) continue;
      if (
        this.client.inventoryController.getItemAmount(ingredient.id) <
        ingredient.amount
      ) {
        return false;
      }
    }
    return true;
  }

  craftItem(itemId: number): void {
    const packet = new ShopCreateClientPacket();
    packet.sessionId = this.client.sessionId;
    packet.craftItemId = itemId;
    this.client.bus!.send(packet);
  }

  private sendBuyItem(itemId: number, amount: number): void {
    const packet = new ShopBuyClientPacket();
    packet.sessionId = this.client.sessionId;
    packet.buyItem = new Item();
    packet.buyItem.id = itemId;
    packet.buyItem.amount = amount;
    this.client.bus!.send(packet);
  }

  private sendSellItem(itemId: number, amount: number): void {
    const packet = new ShopSellClientPacket();
    packet.sessionId = this.client.sessionId;
    packet.sellItem = new Item();
    packet.sellItem.id = itemId;
    packet.sellItem.amount = amount;
    this.client.bus!.send(packet);
  }

  private getItemName(itemId: number): string {
    const record = this.client.getEifRecordById(itemId);
    if (record?.name) return record.name;
    return this.client.locale.shared.itemFallbackName.replace(
      '{id}',
      String(itemId),
    );
  }
}
