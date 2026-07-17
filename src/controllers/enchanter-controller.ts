import { EoWriter, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import { encodeInstanceId, type InstanceRarity } from './instance-controller';

/**
 * REOSERV custom packet family — not in upstream eolib. FAMILY_ENCHANTER
 * (61) lets a player spend shard currency (see `salvage-controller.ts`) to
 * upgrade a rolled instance's rarity, re-roll one or all of its mods, or
 * upgrade a single mod's roll toward its level cap. The client sends
 * `Use` (session short + 36-byte instance id + op char + mod index short);
 * the server replies with `Reply` (one char status). Item + balance changes
 * flow separately via families 54 (INSTANCE_LIST) and 60 (shard totals).
 */
const FAMILY_ENCHANTER = 61;

/** Op codes — must match the server (src/enchanter.rs). */
export const ENCHANT_UPGRADE_RARITY = 0;
export const ENCHANT_REROLL_ONE = 1;
export const ENCHANT_REROLL_ALL = 2;
export const ENCHANT_UPGRADE_ROLL = 3;

export interface EnchanterPricing {
  /** Indexed by InstanceRarity (0=common…3=legendary), ×100. */
  rarityMultX100: number[];
  /** Indexed by opcode (0=upgrade_rarity…3=upgrade_roll), ×100. */
  baseX100: number[];
}

type OpenedSubscriber = () => void;
type ResultSubscriber = (status: number) => void;

/**
 * Tracks the enchanter dialog's session + pricing config, and sends the
 * player's enchant actions. Populated by REOSERV's FAMILY_ENCHANTER Open
 * packet on NPC click — see `src/handlers/enchanter.ts`.
 */
export class EnchanterController {
  private client: Client;
  /** Session id for THIS enchanter window, captured on open. Kept
   *  per-controller (like shop/quest/inn/marriage/barber) rather than read
   *  from the shared `client.sessionId` at send time — see
   *  `shop-controller.ts` for why. */
  private sessionId = 0;
  private pricing: EnchanterPricing = {
    rarityMultX100: [100, 200, 400, 800],
    baseX100: [8000, 2000, 5000, 3000],
  };
  private openedSubscribers: OpenedSubscriber[] = [];
  private resultSubscribers: ResultSubscriber[] = [];
  /** Client-side selection of the instance currently loaded into the
   *  enchanter window. Purely local UI state — dragging an item onto
   *  the drop slot selects it here; there is no server-side deposit
   *  for the enchanter (unlike chest/locker/trade). */
  private selectedId: string | null = null;
  private changedSubscribers: (() => void)[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  handleOpened(sessionId: number, pricing: EnchanterPricing): void {
    this.sessionId = sessionId;
    this.client.sessionId = sessionId;
    this.pricing = pricing;
    this.selectedId = null;
    for (const cb of this.openedSubscribers) cb();
    for (const cb of this.changedSubscribers) cb();
  }

  get selectedInstanceId(): string | null {
    return this.selectedId;
  }

  selectInstance(id: string | null): void {
    this.selectedId = id;
    for (const cb of this.changedSubscribers) cb();
  }

  handleResult(status: number): void {
    for (const cb of this.resultSubscribers) cb(status);
  }

  /** Shard cost of an op on an item of this level + rarity. Mirrors the
   *  server's `round(base × level × mult)`, integer-domain. */
  costFor(op: number, level: number, rarity: InstanceRarity): number {
    const base = this.pricing.baseX100[op] ?? 0;
    const mult = this.pricing.rarityMultX100[rarity] ?? 100;
    return Math.round((base * Math.max(1, level) * mult) / 10000);
  }

  sendAction(instanceId: string, op: number, modIndex: number): void {
    const writer = new EoWriter();
    writer.addShort(this.sessionId);
    writer.addBytes(encodeInstanceId(instanceId));
    writer.addChar(op);
    writer.addShort(modIndex);
    this.client.bus?.sendBuf(
      FAMILY_ENCHANTER as PacketFamily,
      PacketAction.Use,
      writer.toByteArray(),
    );
  }

  subscribeOpened(cb: OpenedSubscriber): void {
    this.openedSubscribers.push(cb);
  }
  unsubscribeOpened(cb: OpenedSubscriber): void {
    this.openedSubscribers = this.openedSubscribers.filter((s) => s !== cb);
  }
  subscribeResult(cb: ResultSubscriber): void {
    this.resultSubscribers.push(cb);
  }
  unsubscribeResult(cb: ResultSubscriber): void {
    this.resultSubscribers = this.resultSubscribers.filter((s) => s !== cb);
  }
  subscribeChanged(cb: () => void): void {
    this.changedSubscribers.push(cb);
  }
  unsubscribeChanged(cb: () => void): void {
    this.changedSubscribers = this.changedSubscribers.filter((s) => s !== cb);
  }
}
