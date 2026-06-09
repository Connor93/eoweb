import { EoWriter, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import { CombatElement } from '@/combat-overlay/element-colors';

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

/** Wire encoding for the mod's kind, parallel to REOSERV's
 *  ModifierKind: 0 = flat, 1 = percent_additive, 2 = percent_multiplicative.
 *  The client uses this to decide whether to render the value as a raw
 *  number or as a percentage (×100 + `%`). */
export enum InstanceModKind {
  Flat = 0,
  PercentAdditive = 1,
  PercentMultiplicative = 2,
}

export interface InstanceMod {
  modId: string;
  /** Designer-facing display name resolved server-side from
   *  MODIFIER_DB at push time. Falls back to `modId` if the mod is
   *  no longer in the pool. */
  name: string;
  kind: InstanceModKind;
  /** snake_case StatTarget variant — e.g. `damage_dealt_fire`,
   *  `magic_find`, `str`. The client prettifies this for display so
   *  the player sees *what stat* the mod actually affects. */
  target: string;
  value: number;
}

export interface InstanceItem {
  instanceId: string;
  baseItemId: number;
  rarity: InstanceRarity;
  level: number;
  element: CombatElement;
  /** 0..14 when equipped in that paperdoll slot, -1 otherwise. */
  equippedSlot: number;
  /** When true the instance lives in the player's locker (bank). */
  inLocker: boolean;
  mods: InstanceMod[];
}

/** One instance sitting on the floor at a given ground-item uid. The
 *  standard `ItemAdd` / map-info / walk-reply traffic still paints the
 *  sprite; this metadata layers the rarity tint + mod tooltip onto it.
 *  Cleared when the matching `ItemRemove` arrives. */
export interface GroundInstanceItem {
  /** Matches `ItemMapInfo.uid` — the map's per-drop item index. */
  itemIndex: number;
  instanceId: string;
  baseItemId: number;
  rarity: InstanceRarity;
  level: number;
  element: CombatElement;
  mods: InstanceMod[];
}

const FAMILY_INSTANCE = 54;
const INSTANCE_ID_LEN = 36;

type InstanceChangedSubscriber = (items: InstanceItem[]) => void;

export class InstanceController {
  private client: Client;
  private items: InstanceItem[] = [];
  private changedSubscribers: InstanceChangedSubscriber[] = [];
  /** Ground drops the server has flagged as instances. Keyed by the
   *  same uid the map renderer uses for the sprite, so `addItemSprite`
   *  in map.ts can look up rarity in O(1). */
  private groundByIndex: Map<number, GroundInstanceItem> = new Map();

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

  /** Map of `playerId → CombatElement` for every nearby player's
   *  equipped weapon. Populated by PlayerPaperdollSnapshot pushes
   *  from REOSERV on map enter and on every equip / unequip of slot 8.
   *  Consumed by combat popups that need to colour by the attacker's
   *  weapon element (Phase G). */
  private weaponElementByPlayer: Map<number, CombatElement> = new Map();

  setWeaponElement(playerId: number, element: CombatElement): void {
    this.weaponElementByPlayer.set(playerId, element);
  }

  weaponElement(playerId: number): CombatElement {
    return this.weaponElementByPlayer.get(playerId) ?? CombatElement.Plain;
  }

  clearWeaponElement(playerId: number): void {
    this.weaponElementByPlayer.delete(playerId);
  }

  /** Stash a ground-instance entry from the INSTANCE_GROUND_ADD packet
   *  (family 54 / action Spec). The map renderer consults this on
   *  every sprite draw, so updates show on the next tick. */
  setGroundInstance(entry: GroundInstanceItem): void {
    this.groundByIndex.set(entry.itemIndex, entry);
  }

  /** Drop the ground-instance entry for a uid. Called from the
   *  standard `ItemRemove` handler so the cache mirrors `nearby.items`
   *  for instance-flagged drops. */
  clearGroundInstance(itemIndex: number): void {
    this.groundByIndex.delete(itemIndex);
  }

  /** Forget every ground-instance entry — used on disconnect /
   *  map-change so stale uids from a previous map can't accidentally
   *  match the index counter on a new map. */
  resetGroundInstances(): void {
    this.groundByIndex.clear();
  }

  /** Drop ground-instance entries whose uid is no longer in the
   *  player's `nearby.items` set. Called from the periodic cleanup
   *  controller so out-of-range entries don't accumulate. */
  pruneGroundInstances(liveUids: Set<number>): void {
    for (const uid of this.groundByIndex.keys()) {
      if (!liveUids.has(uid)) this.groundByIndex.delete(uid);
    }
  }

  groundInstanceByIndex(itemIndex: number): GroundInstanceItem | undefined {
    return this.groundByIndex.get(itemIndex);
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
