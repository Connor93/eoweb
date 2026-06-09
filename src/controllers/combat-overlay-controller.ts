import type { Client } from '@/client';
import { CombatElement } from '@/combat-overlay/element-colors';

export type PopupKind = 'damage' | 'heal' | 'miss';

export interface CombatPopup {
  id: number;
  kind: PopupKind;
  amount: number; // ignored for miss
  element: CombatElement; // defaults to Plain
  worldX: number; // map-tile x of the target
  worldY: number; // map-tile y of the target
  spawnedAtMs: number; // perf.now() at push; controller drops after lifetime
}

export interface HpBarEntry {
  /** Unique key — `"npc:42"` or `"char:1024"`. */
  key: string;
  percent: number; // 0..100
  worldX: number;
  worldY: number;
  remainingTicks: number; // matches existing HealthBar.ticks
}

type Subscriber = () => void;

const POPUP_LIFETIME_MS = 550;

export class CombatOverlayController {
  private nextId = 1;
  private popups: CombatPopup[] = [];
  private hpBars: Map<string, HpBarEntry> = new Map();
  private subscribers: Subscriber[] = [];

  // Constructor takes a Client so future phases can reach controllers via it
  // (paperdoll lookup, etc.) without changing the registration in Client.ts.
  // Argument intentionally unused today.
  constructor(_client: Client) {}

  pushDamage(opts: {
    amount: number;
    element?: CombatElement;
    worldX: number;
    worldY: number;
  }): void {
    this.popups.push({
      id: this.nextId++,
      kind: 'damage',
      amount: opts.amount,
      element: opts.element ?? CombatElement.Plain,
      worldX: opts.worldX,
      worldY: opts.worldY,
      spawnedAtMs: performance.now(),
    });
    this.notify();
  }

  pushHeal(opts: { amount: number; worldX: number; worldY: number }): void {
    this.popups.push({
      id: this.nextId++,
      kind: 'heal',
      amount: opts.amount,
      element: CombatElement.Plain,
      worldX: opts.worldX,
      worldY: opts.worldY,
      spawnedAtMs: performance.now(),
    });
    this.notify();
  }

  pushMiss(opts: { worldX: number; worldY: number }): void {
    this.popups.push({
      id: this.nextId++,
      kind: 'miss',
      amount: 0,
      element: CombatElement.Plain,
      worldX: opts.worldX,
      worldY: opts.worldY,
      spawnedAtMs: performance.now(),
    });
    this.notify();
  }

  setHpBar(entry: HpBarEntry): void {
    this.hpBars.set(entry.key, entry);
    this.notify();
  }

  clearHpBar(key: string): void {
    if (this.hpBars.delete(key)) this.notify();
  }

  /** Called by the overlay component on each render-tick to drop expired popups
   *  and decrement HP-bar ticks. */
  tick(): { popups: CombatPopup[]; hpBars: HpBarEntry[] } {
    const now = performance.now();
    const before = this.popups.length;
    this.popups = this.popups.filter(
      (p) => now - p.spawnedAtMs < POPUP_LIFETIME_MS,
    );
    let dirty = before !== this.popups.length;

    for (const bar of this.hpBars.values()) {
      bar.remainingTicks = Math.max(0, bar.remainingTicks - 1);
    }
    for (const [key, bar] of this.hpBars) {
      if (bar.remainingTicks === 0) {
        this.hpBars.delete(key);
        dirty = true;
      }
    }

    if (dirty) this.notify();
    return { popups: [...this.popups], hpBars: [...this.hpBars.values()] };
  }

  subscribe(cb: Subscriber): void {
    this.subscribers.push(cb);
  }

  unsubscribe(cb: Subscriber): void {
    this.subscribers = this.subscribers.filter((s) => s !== cb);
  }

  private notify(): void {
    for (const cb of this.subscribers) cb();
  }
}
