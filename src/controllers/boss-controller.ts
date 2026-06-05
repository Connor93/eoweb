import type { Client } from '@/client';

/**
 * Tracks alive bosses near the player. Populated by REOSERV's custom
 * `BOSS_PING` packet (family 52, action Ping) — the server pings clients
 * about boss state on map enter and refresh requests, then again with
 * `killed=true` when the boss dies.
 *
 * Custom packets aren't part of the upstream EO protocol; see REOSERV's
 * `src/deep/boss_ping_server_packet.rs` for the wire format.
 */
export interface BossInfo {
  npcIndex: number;
  npcId: number;
  hp: number;
  hpPercentage: number;
}

type BossChangedSubscriber = (bosses: BossInfo[]) => void;

export class BossController {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: reserved for future map-change hooks
  private client: Client;

  private bosses: Map<number, BossInfo> = new Map();
  private changedSubscribers: BossChangedSubscriber[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  /** Called by the boss-ping handler each time the server emits an update. */
  applyPing(info: BossInfo & { killed: boolean }): void {
    if (info.killed) {
      this.bosses.delete(info.npcIndex);
    } else {
      this.bosses.set(info.npcIndex, {
        npcIndex: info.npcIndex,
        npcId: info.npcId,
        hp: info.hp,
        hpPercentage: info.hpPercentage,
      });
    }
    this._notify();
  }

  /** Reset on map change — bosses out of range stop pinging us. */
  clear(): void {
    if (this.bosses.size === 0) return;
    this.bosses.clear();
    this._notify();
  }

  list(): BossInfo[] {
    return Array.from(this.bosses.values());
  }

  subscribeChanged(cb: BossChangedSubscriber): void {
    this.changedSubscribers.push(cb);
  }

  unsubscribeChanged(cb: BossChangedSubscriber): void {
    this.changedSubscribers = this.changedSubscribers.filter((s) => s !== cb);
  }

  private _notify(): void {
    const snapshot = this.list();
    for (const cb of this.changedSubscribers) {
      cb(snapshot);
    }
  }
}
