import { EoWriter, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import { encodeInstanceId } from './instance-controller';

/**
 * REOSERV custom packet family — not in upstream eolib. FAMILY_SALVAGE
 * (60) breaks down rolled instances into shard currency. The client sends
 * `Request` (short instance count + that many 36-byte instance ids); the
 * server replies with `Reply` (six ints: weapon/armor/accessory shard
 * totals, then this batch's weapon/armor/accessory deltas). The server
 * also pushes a `Reply` on map enter with all `gained_*` fields zeroed,
 * purely to seed the display.
 */
const FAMILY_SALVAGE = 60;

export interface ShardCounts {
  weapon: number;
  armor: number;
  accessory: number;
}

type SalvageChangedSubscriber = () => void;

/**
 * Tracks the player's shard currency (weapon/armor/accessory), earned by
 * salvaging rolled instances. Populated by REOSERV's FAMILY_SALVAGE Reply
 * packet, pushed on map enter (seed, deltas zeroed) and after every salvage
 * (with deltas set) — see `src/handlers/salvage.ts`.
 */
export class SalvageController {
  private client: Client;
  private counts: ShardCounts = { weapon: 0, armor: 0, accessory: 0 };
  private gained: ShardCounts = { weapon: 0, armor: 0, accessory: 0 };
  private changedSubscribers: SalvageChangedSubscriber[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  get shardCounts(): ShardCounts {
    return this.counts;
  }

  /** Deltas from the most recent Reply — zeroed on the map-enter seed. */
  get lastGained(): ShardCounts {
    return this.gained;
  }

  setCounts(counts: ShardCounts, gained: ShardCounts): void {
    this.counts = counts;
    this.gained = gained;
    this._notify();
  }

  sendSalvage(instanceIds: string[]): void {
    if (instanceIds.length === 0) return;
    const writer = new EoWriter();
    writer.addShort(instanceIds.length);
    for (const id of instanceIds) {
      writer.addBytes(encodeInstanceId(id));
    }
    this.client.bus?.sendBuf(
      FAMILY_SALVAGE as PacketFamily,
      PacketAction.Request,
      writer.toByteArray(),
    );
  }

  subscribeChanged(cb: SalvageChangedSubscriber): void {
    this.changedSubscribers.push(cb);
  }

  unsubscribeChanged(cb: SalvageChangedSubscriber): void {
    this.changedSubscribers = this.changedSubscribers.filter((s) => s !== cb);
  }

  private _notify(): void {
    for (const cb of this.changedSubscribers) cb();
  }
}
