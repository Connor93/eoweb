import type { LocaleStrings } from '@/locale';

export type StatEffectEntry = { key: string; value: number };

type StatsLocale = LocaleStrings['stats'];

/** Row key (as the server names it) -> the locale description shown under
 *  the tooltip title. */
const ROW_DESCRIPTION: Record<string, keyof StatsLocale> = {
  str: 'descStr',
  int: 'descInt',
  wis: 'descWis',
  agi: 'descAgi',
  con: 'descCon',
  cha: 'descCha',
  damage: 'descDmg',
  accuracy: 'descAccuracy',
  evade: 'descEvade',
  armor: 'descArmor',
  max_hp: 'descHp',
  max_tp: 'descTp',
};

/** The six rows that show a marginal "+1 would give you" list. */
const MARGINAL_ROWS = new Set(['str', 'int', 'wis', 'agi', 'con', 'cha']);

/** Marginal entry key -> its label. Reuses the existing stat-row labels so
 *  the two can never drift apart; only max weight needs its own string. */
const MARGINAL_LABEL: Record<string, keyof StatsLocale> = {
  damage: 'labelDmg',
  accuracy: 'labelAccuracy',
  evade: 'labelEvade',
  armor: 'labelArmor',
  max_hp: 'labelHp',
  max_tp: 'labelTp',
  max_weight: 'effectMaxWeight',
};

/** Matches the rounding used by stat-breakdown.ts / breakdown-tooltip.tsx. */
function fmt(v: number): string {
  return Math.abs(v % 1) < 0.05 ? v.toFixed(0) : v.toFixed(1);
}

function signed(v: number): string {
  return `${v >= 0 ? '+' : ''}${fmt(v)}`;
}

function find(entries: StatEffectEntry[], key: string): number | undefined {
  return entries.find((e) => e.key === key)?.value;
}

/**
 * Render one row's tooltip content. Unknown keys are skipped so an older
 * client tolerates a newer server. A marginal row with nothing to say falls
 * through to "no effect for your class" — which is how CHA stays honest
 * without any per-class prose.
 */
export function buildStatEffectLines(
  row: string,
  entries: StatEffectEntry[],
  locale: LocaleStrings,
): { description: string; lines: string[] } {
  const s = locale.stats;
  const descKey = ROW_DESCRIPTION[row];
  const description = descKey ? s[descKey] : '';
  const lines: string[] = [];

  if (MARGINAL_ROWS.has(row)) {
    const known = entries.filter((e) => e.key in MARGINAL_LABEL);
    if (known.length === 0) {
      return { description, lines: [s.effectNoneForClass] };
    }
    lines.push(s.effectMarginalHeader.replace('{stat}', row.toUpperCase()));
    for (const e of known) {
      lines.push(`${s[MARGINAL_LABEL[e.key]]} ${signed(e.value)}`);
    }
    return { description, lines };
  }

  const threshold = find(entries, 'armor_full_damage_at');
  const exampleIn = find(entries, 'armor_example_in');
  const exampleOut = find(entries, 'armor_example_out');
  if (
    threshold !== undefined &&
    exampleIn !== undefined &&
    exampleOut !== undefined
  ) {
    lines.push(
      s.effectArmorThreshold
        .replace('{threshold}', fmt(threshold))
        .replace('{in}', fmt(exampleIn))
        .replace('{out}', fmt(exampleOut)),
    );
  }

  const needs = find(entries, 'evade_attacker_accuracy_for_90');
  if (needs !== undefined) {
    lines.push(s.effectEvadeNeeds.replace('{accuracy}', fmt(needs)));
  }

  const beats = find(entries, 'accuracy_target_evade_for_90');
  if (beats !== undefined) {
    lines.push(s.effectAccuracyBeats.replace('{evade}', fmt(beats)));
  }

  const effective = find(entries, 'effective');
  if (effective !== undefined) {
    lines.push(s.effectEffectiveInCombat.replace('{value}', fmt(effective)));
  }

  return { description, lines };
}
