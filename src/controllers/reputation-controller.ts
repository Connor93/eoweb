import type { Client } from '@/client';

/**
 * Tracks the player's per-zone reputation. Populated by REOSERV's custom
 * PLAYER_REP packet (family 53, action List) — the server pushes the
 * full snapshot on map enter and after every rep delta. See the wire
 * format in `src/handlers/reputation.ts` and REOSERV's
 * `src/deep/player_rep_list_server_packet.rs`.
 */

/** 0..=4 mirrors ReputationTier in REOSERV. */
export enum ReputationTier {
  Reviled = 0,
  Unfriendly = 1,
  Neutral = 2,
  Friendly = 3,
  Honored = 4,
}

export function reputationTierLabel(tier: ReputationTier): string {
  switch (tier) {
    case ReputationTier.Reviled:
      return 'Reviled';
    case ReputationTier.Unfriendly:
      return 'Unfriendly';
    case ReputationTier.Neutral:
      return 'Neutral';
    case ReputationTier.Friendly:
      return 'Friendly';
    case ReputationTier.Honored:
      return 'Honored';
  }
}

export interface ReputationEntry {
  zoneId: number;
  value: number;
  tier: ReputationTier;
  /** Human-readable zone name from zones.json; empty when unknown. */
  zoneName: string;
}

type ReputationChangedSubscriber = (entries: ReputationEntry[]) => void;

export class ReputationController {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: held for future hooks (e.g. clearing on disconnect)
  private client: Client;

  private entries: ReputationEntry[] = [];
  private changedSubscribers: ReputationChangedSubscriber[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  /** Replace the full snapshot. Server pushes whole-list updates. */
  setEntries(entries: ReputationEntry[]): void {
    this.entries = entries;
    this._notify();
  }

  list(): ReputationEntry[] {
    return this.entries;
  }

  subscribeChanged(cb: ReputationChangedSubscriber): void {
    this.changedSubscribers.push(cb);
  }

  unsubscribeChanged(cb: ReputationChangedSubscriber): void {
    this.changedSubscribers = this.changedSubscribers.filter((s) => s !== cb);
  }

  private _notify(): void {
    const snapshot = this.entries.slice();
    for (const cb of this.changedSubscribers) {
      cb(snapshot);
    }
  }
}
