import { useEffect, useState } from 'preact/hooks';
import { FaShieldAlt } from 'react-icons/fa';
import {
  type ReputationEntry,
  ReputationTier,
  reputationTierLabel,
} from '@/controllers';
import { UI_PANEL_BG } from '@/ui/consts';
import { useClient } from '@/ui/context';
import { useBackdropBlur } from '@/ui/in-game';

/**
 * HUD widget showing the player's per-zone reputation tiers. Populated
 * by REOSERV's custom PLAYER_REP packet — see `src/handlers/reputation.ts`.
 *
 * v1 lists every zone the player has any rep in. Future iterations might
 * highlight the current zone (requires map_id → zone_id mapping the
 * client doesn't have yet) or move into a character-dialog tab.
 */
export function ReputationBadge() {
  const client = useClient();
  const blur = useBackdropBlur();
  const [entries, setEntries] = useState<ReputationEntry[]>(() =>
    client.reputationController.list(),
  );

  useEffect(() => {
    const handler = (next: ReputationEntry[]) => {
      setEntries(next);
    };
    client.reputationController.subscribeChanged(handler);
    return () => {
      client.reputationController.unsubscribeChanged(handler);
    };
  }, [client]);

  if (entries.length === 0) return null;

  // Sort by absolute value descending so the player's strongest standings
  // (whether Honored or Reviled) surface first.
  const sorted = [...entries].sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value),
  );

  return (
    <div
      class={`pointer-events-none flex flex-col gap-0.5 rounded ${UI_PANEL_BG} px-2 py-1 ${blur}`}
    >
      <div class='flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wider'>
        <span class='shrink-0'>
          <FaShieldAlt size={10} />
        </span>
        Reputation
      </div>
      {sorted.map((entry) => (
        <div
          key={entry.zoneId}
          class='flex min-w-44 items-center justify-between gap-3 text-slate-100 text-xs'
        >
          <span class='font-medium'>Zone {entry.zoneId}</span>
          <span class={tierClass(entry.tier)}>
            {reputationTierLabel(entry.tier)}
          </span>
          <span class='shrink-0 font-mono text-[10px] text-slate-400'>
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function tierClass(tier: ReputationTier): string {
  switch (tier) {
    case ReputationTier.Reviled:
      return 'text-red-400';
    case ReputationTier.Unfriendly:
      return 'text-orange-400';
    case ReputationTier.Neutral:
      return 'text-slate-300';
    case ReputationTier.Friendly:
      return 'text-green-400';
    case ReputationTier.Honored:
      return 'text-yellow-300';
  }
}
