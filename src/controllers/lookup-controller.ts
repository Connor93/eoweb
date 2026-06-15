import type { Client } from '@/client';

/**
 * Holds the most recent `#item` / `#npc` lookup result pushed by the
 * server (deep family 56, action Reply) and notifies subscribers. The
 * server computes everything the web client can't — the rolled-mod pool,
 * drop tables with level ranges, and map spawns — and ships it as JSON;
 * this controller just stores the parsed result for the lookup dialog.
 */

/** One possible rolled mod for an instanced item. */
export type LookupModInfo = {
  name: string;
  /** snake_case stat target (e.g. `damage_dealt_fire`) — prettified for display. */
  target: string;
  /** 0 = flat, 1 = percent additive, 2 = percent multiplicative. */
  kind: number;
  /** Base roll range at level 1; scaled per level via `levelScaling`. */
  low: number;
  high: number;
  /** How strongly the range grows with item level (0 = flat, 1 = full curve). */
  levelScaling: number;
  /** Rarity tiers this mod can roll on, lowercase. */
  tiers: string[];
  /** Rendered condition ("below 30% HP"); empty when unconditional. */
  condition: string;
};

export type LookupTierCount = { tier: string; count: number };

export type LookupSpawnMap = {
  mapId: number;
  mapName: string;
  count: number;
};

export type LookupDropSource = {
  npcId: number;
  npcName: string;
  ratePct: number;
  minAmount: number;
  maxAmount: number;
  instanced: boolean;
  levelMin: number;
  levelMax: number;
};

export type LookupStatLine = { label: string; value: string };

export type LookupNpcDrop = {
  itemId: number;
  itemName: string;
  ratePct: number;
  minAmount: number;
  maxAmount: number;
  instanced: boolean;
  levelMin: number;
  levelMax: number;
};

export type ItemLookup = {
  kind: 'item';
  id: number;
  name: string;
  graphicId: number;
  typeLabel: string;
  category: string | null;
  /** Element wire value (0 = plain .. 6 = dark), parallel to `CombatElement`. */
  element: number;
  possibleMods: LookupModInfo[];
  modsPerTier: LookupTierCount[];
  drops: LookupDropSource[];
  spawnMaps: LookupSpawnMap[];
};

export type NpcLookup = {
  kind: 'npc';
  id: number;
  name: string;
  graphicId: number;
  level: number;
  boss: boolean;
  element: number;
  stats: LookupStatLine[];
  drops: LookupNpcDrop[];
  spawnMaps: LookupSpawnMap[];
};

export type LookupNotFound = { kind: 'not_found'; query: string };

export type LookupResult = ItemLookup | NpcLookup | LookupNotFound;

type LookupSubscriber = (result: LookupResult | null) => void;

export class LookupController {
  private result: LookupResult | null = null;
  private subscribers: LookupSubscriber[] = [];

  // Mirrors the other controllers' `new XController(this)` construction;
  // this one needs nothing off the client.
  constructor(_client: Client) {}

  setResult(result: LookupResult): void {
    this.result = result;
    for (const cb of this.subscribers) cb(this.result);
  }

  current(): LookupResult | null {
    return this.result;
  }

  subscribe(cb: LookupSubscriber): void {
    this.subscribers.push(cb);
  }

  unsubscribe(cb: LookupSubscriber): void {
    this.subscribers = this.subscribers.filter((s) => s !== cb);
  }
}
