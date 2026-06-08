import { EoWriter, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';

/**
 * Tracks the player's rolled, hash-keyed instanced items (weapons /
 * armor / accessories). Populated by REOSERV's custom INSTANCE_LIST
 * packet (family 54, action List) — the server pushes the full
 * snapshot on map enter and after every grant / pickup / equip /
 * trade.
 *
 * Stackables continue to flow through the classic inventory packet on
 * `InventoryController.items`. This controller is additive.
 */

/** 0..=3 mirrors RarityTier in REOSERV. */
export enum InstanceRarity {
  Common = 0,
  Rare = 1,
  Epic = 2,
  Legendary = 3,
}

export function instanceRarityLabel(rarity: InstanceRarity): string {
  switch (rarity) {
    case InstanceRarity.Common:
      return 'Common';
    case InstanceRarity.Rare:
      return 'Rare';
    case InstanceRarity.Epic:
      return 'Epic';
    case InstanceRarity.Legendary:
      return 'Legendary';
  }
}

export interface InstanceMod {
  modId: string;
  value: number;
}

export interface InstanceItem {
  instanceId: string;
  baseItemId: number;
  rarity: InstanceRarity;
  level: number;
  /** 0..14 when equipped in that paperdoll slot, -1 otherwise. */
  equippedSlot: number;
  /** When true the instance lives in the player's locker (bank). */
  inLocker: boolean;
  mods: InstanceMod[];
}

const FAMILY_INSTANCE = 54;
const INSTANCE_ID_LEN = 36;

type InstanceChangedSubscriber = (items: InstanceItem[]) => void;

export class InstanceController {
  private client: Client;
  private items: InstanceItem[] = [];
  private changedSubscribers: InstanceChangedSubscriber[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  setItems(items: InstanceItem[]): void {
    const prevByInstance = new Map(this.items.map((i) => [i.instanceId, i]));
    this.items = items;

    // Clear slots whose instance was equipped before but is no longer
    // present here (unequipped, traded, destroyed, …).
    for (const [id, prev] of prevByInstance) {
      if (prev.equippedSlot < 0) continue;
      const current = items.find((i) => i.instanceId === id);
      if (!current || current.equippedSlot !== prev.equippedSlot) {
        this.applyEquipmentSlot(prev.equippedSlot, 0);
      }
    }
    // Write the visual paperdoll slot for any currently-equipped
    // instance so the existing EquipSlot UI renders its icon.
    for (const inst of items) {
      if (inst.equippedSlot >= 0) {
        this.applyEquipmentSlot(inst.equippedSlot, inst.baseItemId);
      }
    }
    this.client.inventoryController.notifyEquipmentChanged();

    this._notify();
  }

  list(): InstanceItem[] {
    return this.items;
  }

  /** Instances currently in inventory (not equipped, not in locker). */
  inventoryList(): InstanceItem[] {
    return this.items.filter((i) => i.equippedSlot < 0 && !i.inLocker);
  }

  /** Instances stored in the player's locker (bank). */
  lockerList(): InstanceItem[] {
    return this.items.filter((i) => i.inLocker);
  }

  byInstanceId(id: string): InstanceItem | undefined {
    return this.items.find((i) => i.instanceId === id);
  }

  equippedAtSlot(slot: number): InstanceItem | undefined {
    return this.items.find((i) => i.equippedSlot === slot);
  }

  sendEquip(instanceId: string, subLoc: number): void {
    const writer = new EoWriter();
    writer.addBytes(this.encodeInstanceId(instanceId));
    writer.addChar(Math.max(0, Math.min(1, Math.floor(subLoc))));
    this.client.bus?.sendBuf(
      FAMILY_INSTANCE as PacketFamily,
      PacketAction.Add,
      writer.toByteArray(),
    );
  }

  sendUnequip(instanceId: string): void {
    const writer = new EoWriter();
    writer.addBytes(this.encodeInstanceId(instanceId));
    this.client.bus?.sendBuf(
      FAMILY_INSTANCE as PacketFamily,
      PacketAction.Remove,
      writer.toByteArray(),
    );
  }

  sendLockerDeposit(instanceId: string): void {
    const writer = new EoWriter();
    writer.addBytes(this.encodeInstanceId(instanceId));
    this.client.bus?.sendBuf(
      FAMILY_INSTANCE as PacketFamily,
      PacketAction.Drop,
      writer.toByteArray(),
    );
  }

  sendLockerTake(instanceId: string): void {
    const writer = new EoWriter();
    writer.addBytes(this.encodeInstanceId(instanceId));
    this.client.bus?.sendBuf(
      FAMILY_INSTANCE as PacketFamily,
      PacketAction.Get,
      writer.toByteArray(),
    );
  }

  sendChestDeposit(instanceId: string): void {
    const writer = new EoWriter();
    writer.addBytes(this.encodeInstanceId(instanceId));
    this.client.bus?.sendBuf(
      FAMILY_INSTANCE as PacketFamily,
      PacketAction.Use,
      writer.toByteArray(),
    );
  }

  sendChestTake(instanceId: string): void {
    const writer = new EoWriter();
    writer.addBytes(this.encodeInstanceId(instanceId));
    this.client.bus?.sendBuf(
      FAMILY_INSTANCE as PacketFamily,
      PacketAction.Buy,
      writer.toByteArray(),
    );
  }

  sendTradeAdd(instanceId: string): void {
    const writer = new EoWriter();
    writer.addBytes(this.encodeInstanceId(instanceId));
    this.client.bus?.sendBuf(
      FAMILY_INSTANCE as PacketFamily,
      PacketAction.Sell,
      writer.toByteArray(),
    );
  }

  sendTradeRemove(instanceId: string): void {
    const writer = new EoWriter();
    writer.addBytes(this.encodeInstanceId(instanceId));
    this.client.bus?.sendBuf(
      FAMILY_INSTANCE as PacketFamily,
      PacketAction.Take,
      writer.toByteArray(),
    );
  }

  subscribeChanged(cb: InstanceChangedSubscriber): void {
    this.changedSubscribers.push(cb);
  }

  unsubscribeChanged(cb: InstanceChangedSubscriber): void {
    this.changedSubscribers = this.changedSubscribers.filter((s) => s !== cb);
  }

  private _notify(): void {
    for (const cb of this.changedSubscribers) cb(this.items);
  }

  private encodeInstanceId(instanceId: string): Uint8Array {
    const raw = new TextEncoder().encode(instanceId);
    if (raw.length === INSTANCE_ID_LEN) return raw;
    const out = new Uint8Array(INSTANCE_ID_LEN);
    out.set(raw.slice(0, INSTANCE_ID_LEN));
    if (raw.length < INSTANCE_ID_LEN) {
      out.fill(0x20, raw.length);
    }
    return out;
  }

  private applyEquipmentSlot(slot: number, itemId: number): void {
    const eq = this.client.equipment;
    switch (slot) {
      case 0:
        eq.boots = itemId;
        break;
      case 1:
        eq.accessory = itemId;
        break;
      case 2:
        eq.gloves = itemId;
        break;
      case 3:
        eq.belt = itemId;
        break;
      case 4:
        eq.armor = itemId;
        break;
      case 5:
        eq.necklace = itemId;
        break;
      case 6:
        eq.hat = itemId;
        break;
      case 7:
        eq.shield = itemId;
        break;
      case 8:
        eq.weapon = itemId;
        break;
      case 9:
        eq.ring[0] = itemId;
        break;
      case 10:
        eq.ring[1] = itemId;
        break;
      case 11:
        eq.armlet[0] = itemId;
        break;
      case 12:
        eq.armlet[1] = itemId;
        break;
      case 13:
        eq.bracer[0] = itemId;
        break;
      case 14:
        eq.bracer[1] = itemId;
        break;
    }
  }
}
