import type { SkillCatalogEntry } from '@/controllers';
import type { LocaleStrings } from '@/locale';
import { formatLocaleString } from '@/locale';

/** `8000` → `"8"`, `4500` → `"4.5"` — no trailing `.0` on whole seconds. */
function formatSeconds(ms: number): string {
  return String(Number((ms / 1000).toFixed(1)));
}

/**
 * Compact stat line above the description: costs, then cooldown, then range.
 * Every part is dropped when it does not apply — no skill authors an HP cost
 * today, and a self-target skill has no range. A `range` of 0 means "use the
 * equipped weapon's range", which is not a number worth printing, so it is
 * treated as absent.
 *
 * Shared by the hotbar slot and the skills dialog (cards and learn-tree rows)
 * so the two surfaces cannot drift apart on formatting or on which parts they
 * choose to drop. Returns `''` when nothing applies; callers decide whether an
 * empty line means "render no line" or "render no tooltip at all".
 */
export function skillStatLine(
  entry: SkillCatalogEntry,
  locale: LocaleStrings,
): string {
  const parts: string[] = [];
  const t = locale.skills;

  if (entry.costHp > 0) {
    parts.push(
      formatLocaleString(t.tooltipCostHp, { cost: String(entry.costHp) }),
    );
  }
  if (entry.costTp > 0) {
    parts.push(
      formatLocaleString(t.tooltipCostTp, { cost: String(entry.costTp) }),
    );
  }
  if (entry.cooldownMs > 0) {
    parts.push(
      formatLocaleString(t.tooltipCooldown, {
        seconds: formatSeconds(entry.cooldownMs),
      }),
    );
  }
  if (entry.target === 'enemy' && entry.range > 0) {
    const template = entry.range === 1 ? t.tooltipRangeOne : t.tooltipRangeMany;
    parts.push(formatLocaleString(template, { range: String(entry.range) }));
  }

  return parts.join(' \u00b7 ');
}
