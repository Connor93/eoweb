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
  // entityId -> (statusId -> view)
  private statuses = new Map<number, Map<string, StatusView>>();
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

  sync(entityId: number, entries: StatusEntryWire[]): void {
    this.statuses.set(
      entityId,
      new Map(entries.map((e) => [e.statusId, this.toView(e)])),
    );
    this.notify();
  }

  add(entityId: number, entry: StatusEntryWire): void {
    let m = this.statuses.get(entityId);
    if (!m) {
      m = new Map();
      this.statuses.set(entityId, m);
    }
    m.set(entry.statusId, this.toView(entry));
    this.notify();
  }

  remove(entityId: number, statusId: string): void {
    this.statuses.get(entityId)?.delete(statusId);
    this.notify();
  }

  /** The local player's statuses — what the buff bar renders. */
  selfStatuses(): StatusView[] {
    const m = this.statuses.get(this.client.playerId);
    return m ? [...m.values()] : [];
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
    for (const [entityId, m] of this.statuses) {
      for (const [statusId, v] of m) {
        if (!v.permanent && v.readyAt <= performance.now()) {
          m.delete(statusId);
          changed = true;
        }
      }
      if (m.size === 0) this.statuses.delete(entityId);
    }
    if (changed) this.notify();
  }
}
