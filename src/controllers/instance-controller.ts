import type { Client } from '@/client';

/**
 * Tracks the player's rolled, hash-keyed instanced items (weapons /
 * armor / accessories). Populated by REOSERV's custom INSTANCE_LIST
 * packet (family 54, action List) — the server pushes the full
 * snapshot on map enter and after every grant / pickup / trade.
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
  mods: InstanceMod[];
}

type InstanceChangedSubscriber = (items: InstanceItem[]) => void;

export class InstanceController {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: held for future hooks
  private client: Client;

  private items: InstanceItem[] = [];
  private changedSubscribers: InstanceChangedSubscriber[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  setItems(items: InstanceItem[]): void {
    this.items = items;
    this._notify();
  }

  list(): InstanceItem[] {
    return this.items;
  }

  byInstanceId(id: string): InstanceItem | undefined {
    return this.items.find((i) => i.instanceId === id);
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
}
