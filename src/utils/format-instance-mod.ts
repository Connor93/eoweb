/** Shared formatter for a single rolled-mod line in an instance tooltip.
 *  Renders bonus + stat (+ flavor name) so the player can see both what
 *  the mod does and what it's called. Used by inventory cards, equip-
 *  slot tooltips, locker / chest / trade dialogs so the format stays
 *  consistent everywhere.
 *
 *  Examples:
 *    "+10% Damage dealt (Brutal)"
 *    "+5.3 Fire damage (Burning)"
 *    "+20% Damage dealt (Predator)"   // percent_multiplicative
 *    "+2 Strength (Mighty)"
 */

export interface FormattableInstanceMod {
  modId: string;
  name: string;
  kind: number;
  target: string;
  value: number;
}

const KIND_PERCENT_ADDITIVE = 1;
const KIND_PERCENT_MULTIPLICATIVE = 2;

/** Special-case word replacements for snake_case → display. Keeps
 *  abbreviations capitalized + expands the core stats so the player
 *  doesn't see "+10% int". Order doesn't matter — applied per word. */
const TARGET_WORD: Record<string, string> = {
  hp: 'HP',
  tp: 'TP',
  sp: 'SP',
  xp: 'XP',
  str: 'Strength',
  int: 'Intelligence',
  wis: 'Wisdom',
  agi: 'Agility',
  con: 'Constitution',
  cha: 'Charisma',
};

/** snake_case → "Sentence case" for display. Replaces known stat
 *  abbreviations with their full names. */
function prettyTarget(target: string): string {
  if (!target) return '';
  return target
    .split('_')
    .map((word, i) => {
      const replacement = TARGET_WORD[word];
      if (replacement) return replacement;
      // First word capitalised, rest stay lowercase so e.g.
      // "damage_dealt_fire" reads "Damage dealt fire" rather than
      // shouty "Damage Dealt Fire".
      return i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(' ');
}

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
  // bonus + stat are the actionable info; flavor name goes in parens
  // so players can still link "the Brutal mod" to its visible row.
  // Falls back gracefully if either piece is missing (old wire, mod
  // pulled from pool, etc.).
  const statLabel = prettyTarget(mod.target);
  const flavor = mod.name && mod.name !== mod.modId ? mod.name : '';
  if (statLabel && flavor) {
    return `${sign}${valStr}${suffix} ${statLabel} (${flavor})`;
  }
  if (statLabel) {
    return `${sign}${valStr}${suffix} ${statLabel}`;
  }
  return `${sign}${valStr}${suffix} ${flavor || mod.modId}`;
}
