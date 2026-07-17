import { EoWriter, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import { encodeInstanceId, type InstanceRarity } from './instance-controller';

/**
 * REOSERV custom packet family — not in upstream eolib. FAMILY_SALVAGE
 * (60) breaks down rolled instances into shard currency. The client sends
 * `Request` (short instance count + that many 36-byte instance ids); the
 * server replies with `Reply` (eleven ints: weapon/armor/accessory shard
 * totals, then this batch's weapon/armor/accessory deltas, then the yield
 * config `per_level_x100` + the four rarity multipliers `×100` in
 * common/rare/epic/legendary order — used by `yieldFor` to preview yields).
 * The server also pushes a `Reply` on map enter with all `gained_*` fields
 * zeroed, purely to seed the display + config.
 */
const FAMILY_SALVAGE = 60;

export interface ShardCounts {
  weapon: number;
  armor: number;
  accessory: number;
}

export interface SalvageYieldConfig {
  perLevelX100: number;
  /** Indexed by InstanceRarity (0=common … 3=legendary). */
  multX100: number[];
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
  private yieldConfig: SalvageYieldConfig = {
    perLevelX100: 100,
    multX100: [100, 200, 500, 1000],
  };
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

  setCounts(
    counts: ShardCounts,
    gained: ShardCounts,
    config: SalvageYieldConfig,
  ): void {
    this.counts = counts;
    this.gained = gained;
    this.yieldConfig = config;
    this._notify();
  }

  /**
   * Estimated shards from salvaging one instance of this level + rarity —
   * matches the server's `round(level × per_level × mult)`. Integer-domain to
   * mirror the server's arithmetic. The server's actual credit is authoritative.
   */
  yieldFor(level: number, rarity: InstanceRarity): number {
    const mult = this.yieldConfig.multX100[rarity] ?? 100;
    return Math.round(
      (Math.max(1, level) * this.yieldConfig.perLevelX100 * mult) / 10000,
    );
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
