/** Shared formatter for a single rolled-mod line in an instance tooltip.
 *  Renders the name (or mod_id fallback) plus the value, formatted per
 *  the mod's kind: flat values stay as raw numbers ("+5.3 Burning");
 *  percent kinds get ×100 plus a `%` suffix ("+5% Brutal", "+20%
 *  Predator"). Used by inventory cards, equip-slot tooltips, locker /
 *  chest / trade dialogs so the format stays consistent everywhere. */

export interface FormattableInstanceMod {
  modId: string;
  name: string;
  kind: number;
  value: number;
}

const KIND_PERCENT_ADDITIVE = 1;
const KIND_PERCENT_MULTIPLICATIVE = 2;

export function formatInstanceMod(mod: FormattableInstanceMod): string {
  const isPercent =
    mod.kind === KIND_PERCENT_ADDITIVE ||
    mod.kind === KIND_PERCENT_MULTIPLICATIVE;
  const displayValue = isPercent ? mod.value * 100 : mod.value;
  const suffix = isPercent ? '%' : '';
  const sign = displayValue >= 0 ? '+' : '';
  const abs = Math.abs(displayValue);
  let valStr: string;
  if (abs === 0) {
    valStr = '0';
  } else if (!isPercent && abs < 0.1) {
    valStr = displayValue.toFixed(2);
  } else if (Math.abs(displayValue % 1) < 0.05) {
    valStr = displayValue.toFixed(0);
  } else {
    valStr = displayValue.toFixed(1);
  }
  const label = mod.name || mod.modId;
  return `${sign}${valStr}${suffix} ${label}`;
}
