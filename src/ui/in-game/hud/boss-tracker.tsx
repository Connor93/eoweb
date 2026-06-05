import { useEffect, useState } from 'preact/hooks';
import { FaSkull } from 'react-icons/fa';
import type { BossInfo } from '@/controllers';
import { UI_PANEL_BG } from '@/ui/consts';
import { useClient } from '@/ui/context';
import { useBackdropBlur } from '@/ui/in-game';

/**
 * HUD widget surfacing alive bosses in the player's range. Renders one
 * row per boss with name + HP bar. Hidden entirely when no bosses are
 * pinging us. Populated by REOSERV's custom BOSS_PING packet — see
 * `src/handlers/boss.ts`.
 */
export function BossTracker() {
  const client = useClient();
  const blur = useBackdropBlur();
  const [bosses, setBosses] = useState<BossInfo[]>(() =>
    client.bossController.list(),
  );

  useEffect(() => {
    const handler = (next: BossInfo[]) => {
      setBosses(next);
    };
    client.bossController.subscribeChanged(handler);
    return () => {
      client.bossController.unsubscribeChanged(handler);
    };
  }, [client]);

  if (bosses.length === 0) return null;

  return (
    <div
      class={`pointer-events-none flex flex-col gap-1 rounded ${UI_PANEL_BG} px-2 py-1 ${blur}`}
    >
      {bosses.map((boss) => {
        const name =
          client.enf?.npcs[boss.npcId - 1]?.name ?? `NPC ${boss.npcId}`;
        return (
          <div
            key={boss.npcIndex}
            class='flex min-w-40 items-center gap-2 text-slate-100 text-xs'
          >
            <span class='shrink-0 text-red-400'>
              <FaSkull size={12} />
            </span>
            <span class='min-w-0 flex-1 truncate font-medium'>{name}</span>
            <div class='relative h-2 w-20 overflow-hidden rounded bg-slate-800'>
              <div
                class='absolute inset-y-0 left-0 bg-red-500/80 transition-[width] duration-300'
                style={{
                  width: `${Math.max(0, Math.min(100, boss.hpPercentage))}%`,
                }}
              />
            </div>
            <span class='shrink-0 font-mono text-[10px] text-slate-400'>
              {boss.hpPercentage}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
