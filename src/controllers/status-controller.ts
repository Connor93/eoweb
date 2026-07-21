import type { Client } from '@/client';

/** Raw status entry as parsed off the wire (remaining_ms, not readyAt). */
export interface StatusEntryWire {
  statusId: string;
  name: string;
  iconId: string;
  isDebuff: boolean;
  showTimer: boolean;
  permanent: boolean;
  stacks: number;
  durationMs: number;
  remainingMs: number;
}

/** A status ready to render: remaining_ms converted to a local deadline. */
export interface StatusView {
  statusId: string;
  name: string;
  iconId: string;
  isDebuff: boolean;
  showTimer: boolean;
  permanent: boolean;
  stacks: number;
  durationMs: number;
  readyAt: number; // performance.now() + remainingMs; unused when permanent
}

export class StatusController {
  private client: Client;
  // key ("player:<id>" | "npc:<index>") -> (statusId -> view)
  private statuses = new Map<string, Map<string, StatusView>>();
  private subscribers: (() => void)[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== fn);
    };
  }

  private notify(): void {
    for (const fn of this.subscribers) fn();
  }

  private toView(e: StatusEntryWire): StatusView {
    return {
      statusId: e.statusId,
      name: e.name,
      iconId: e.iconId,
      isDebuff: e.isDebuff,
      showTimer: e.showTimer,
      permanent: e.permanent,
      stacks: e.stacks,
      durationMs: e.durationMs,
      readyAt: performance.now() + e.remainingMs,
    };
  }

  sync(key: string, entries: StatusEntryWire[]): void {
    this.statuses.set(
      key,
      new Map(entries.map((e) => [e.statusId, this.toView(e)])),
    );
    this.notify();
  }

  add(key: string, entry: StatusEntryWire): void {
    let m = this.statuses.get(key);
    if (!m) {
      m = new Map();
      this.statuses.set(key, m);
    }
    m.set(entry.statusId, this.toView(entry));
    this.notify();
  }

  remove(key: string, statusId: string): void {
    this.statuses.get(key)?.delete(statusId);
    this.notify();
  }

  /** The local player's statuses — what the buff bar renders. */
  selfStatuses(): StatusView[] {
    return this.statusesFor(`player:${this.client.playerId}`);
  }

  /** All statuses for an arbitrary namespaced key ("player:<id>" | "npc:<index>"). */
  statusesFor(key: string): StatusView[] {
    const m = this.statuses.get(key);
    return m ? [...m.values()] : [];
  }

  /** Convenience accessor for an NPC's statuses, keyed by map NPC index. */
  npcStatuses(index: number): StatusView[] {
    return this.statusesFor(`npc:${index}`);
  }

  remainingMs(v: StatusView): number {
    return v.permanent ? 0 : Math.max(0, v.readyAt - performance.now());
  }

  fraction(v: StatusView): number {
    if (v.permanent || v.durationMs <= 0) return 0;
    return Math.max(0, Math.min(1, this.remainingMs(v) / v.durationMs));
  }

  tick(): void {
    let changed = false;
    for (const [key, m] of this.statuses) {
      for (const [statusId, v] of m) {
        if (!v.permanent && v.readyAt <= performance.now()) {
          m.delete(statusId);
          changed = true;
        }
      }
      if (m.size === 0) this.statuses.delete(key);
    }
    if (changed) this.notify();
  }
}
