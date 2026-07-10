import { useEffect, useRef } from 'preact/hooks';
import { useClient, useLocale } from '@/ui/context';
import { usePlayerStats } from '@/ui/in-game';

/**
 * One-shot nudge: the first time the player has unspent stat points this
 * session — a fresh character logging in with starting points, or points
 * arriving via the welcome packet — pop a toast pointing them to the
 * Character screen. Level-ups show their own toast and the nav badge is the
 * persistent reminder, so we only nudge once per session here. Renders
 * nothing; the toast is shown via the existing ToastController / StatusMessages.
 */
export function StatPointsNudge() {
  const client = useClient();
  const { locale } = useLocale();
  const { statPoints } = usePlayerStats();
  const nudged = useRef(false);

  useEffect(() => {
    if (statPoints > 0 && !nudged.current) {
      nudged.current = true;
      client.toastController.showWarning(
        locale.stats.unspentPointsNudge.replace('{count}', String(statPoints)),
      );
    }
  }, [statPoints, client, locale]);

  return null;
}
