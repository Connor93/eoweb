import { useEffect, useState } from 'preact/hooks';
import { UI_PANEL_BG } from '@/ui/consts';
import { useClient } from '@/ui/context';
import { useBackdropBlur } from '@/ui/in-game';
import { SkillIcon } from './skill-icon';

/**
 * Buff bar: one chip per status on the local player (icon + name + countdown +
 * stacks). Fed by `statusController` over the FAMILY_STATUS packets. Hidden
 * when the player has no statuses. Icons via <SkillIcon> (game-icons
 * mask-tint), letter fallback.
 */
export function BuffBar() {
  const client = useClient();
  const blur = useBackdropBlur();
  const [, force] = useState(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((n) => n + 1);
      const anyTimed = client.statusController
        .selfStatuses()
        .some((v) => !v.permanent);
      if (anyTimed) raf = requestAnimationFrame(loop);
    };
    const onChange = () => {
      cancelAnimationFrame(raf);
      loop();
    };
    const unsub = client.statusController.subscribe(onChange);
    loop();
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [client]);

  const statuses = client.statusController.selfStatuses();
  if (statuses.length === 0) return null;

  return (
    <div
      class={`pointer-events-none flex flex-col gap-1 rounded ${UI_PANEL_BG} px-2 py-1 ${blur}`}
    >
      {statuses.map((v) => {
        const showTimer = v.showTimer && !v.permanent;
        const remainingS = showTimer
          ? Math.ceil(client.statusController.remainingMs(v) / 1000)
          : 0;
        const frac = client.statusController.fraction(v);
        return (
          <div
            key={v.statusId}
            class={`flex min-w-40 items-center gap-2 text-xs ${
              v.isDebuff ? 'text-red-200' : 'text-slate-100'
            }`}
          >
            <SkillIcon
              iconId={v.iconId}
              label={v.name}
              tone={v.isDebuff ? 'debuff' : 'buff'}
              active={v.permanent}
            />
            <span
              class='pointer-events-auto min-w-0 flex-1 truncate font-medium'
              title={v.name}
            >
              {v.name}
            </span>
            {v.stacks > 1 && (
              <span class='shrink-0 font-mono text-[10px] text-slate-300'>
                x{v.stacks}
              </span>
            )}
            {showTimer && (
              <>
                <div class='relative h-1.5 w-16 overflow-hidden rounded bg-slate-800'>
                  <div
                    class={`absolute inset-y-0 left-0 ${
                      v.isDebuff ? 'bg-red-500/80' : 'bg-emerald-500/80'
                    }`}
                    style={{ width: `${frac * 100}%` }}
                  />
                </div>
                <span class='shrink-0 font-mono text-[10px] text-slate-400'>
                  {remainingS}s
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
