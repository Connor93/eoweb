import type { EifRecord } from 'eolib';

// Mirrors REOSERV's AUTHOR-AT-MAX item scaling (src/character/calculate_stats.rs
// + config/Formulas.ron). An item pub stores each stat at its MAX-LEVEL value;
// a lower-level instance scales DOWN: contribution(L) = base × curve(L)/curve(50).
// Damage + accuracy use the offense curve; hp/tp/armor/evade + the six core
// stats use survivability. Keep the exponents in sync with Formulas.ron
// (offense = level^1.505, survivability = level^1.177). NOTE: this replaced an
// older single linear "scale-UP" levelCurve (1 + 0.1·(L−1)) that made low-level
// tooltips show the max-level stats — see the scaling-rework flip.
export const MAX_LEVEL = 50;

function offenseCurve(level: number): number {
  return Math.max(level, 1) ** 1.505;
}
function survivabilityCurve(level: number): number {
  return Math.max(level, 1) ** 1.177;
}

/** Mod-roll curve (linear, = level): mod_curve(1)=1, mod_curve(50)=50. */
export function modCurve(level: number): number {
  return Math.max(level, 1);
}

/** Author-at-max offense scale-down factor: 1.0 at L50, ~1/360 at L1. */
export function offenseScale(level: number): number {
  return offenseCurve(level) / offenseCurve(MAX_LEVEL);
}
/** Author-at-max survivability scale-down factor: 1.0 at L50, ~1/100 at L1. */
export function survivabilityScale(level: number): number {
  return survivabilityCurve(level) / survivabilityCurve(MAX_LEVEL);
}

function scale(value: number, factor: number): number {
  return Math.round(value * factor);
}

/** Produce the level-scaled base-stat lines for an instanced item's
 *  tooltip. Shows the same shape as `getItemMeta`'s damage / hp / hit /
 *  def / stat lines but scaled by the author-at-max curves so the player
 *  sees the numbers combat will actually use, not the raw (max-level) pub
 *  values. Stat *requirements* (`levelRequirement`, `strRequirement`,
 *  etc.) aren't scaled and aren't surfaced here — they're on the base
 *  item and unchanged by rolling. */
export function formatInstanceBaseStats(
  record: EifRecord,
  level: number,
): string[] {
  const lines: string[] = [];
  const off = offenseScale(level); // damage, accuracy
  const surv = survivabilityScale(level); // hp/tp/armor/evade + core stats

  const minDamage = scale(record.minDamage, off);
  const maxDamage = scale(record.maxDamage, off);
  if (minDamage || maxDamage) {
    lines.push(`damage: ${minDamage} - ${maxDamage}`);
  }

  const hp = scale(record.hp, surv);
  const tp = scale(record.tp, surv);
  if (hp || tp) {
    const parts: string[] = ['add+'];
    if (hp) parts.push(`${hp}hp`);
    if (tp) parts.push(`${tp}tp`);
    lines.push(parts.join(' '));
  }

  const accuracy = scale(record.accuracy, off);
  if (accuracy) {
    lines.push(`plus+ ${accuracy}hit`);
  }

  const evade = scale(record.evade, surv);
  const armor = scale(record.armor, surv);
  if (evade || armor) {
    const parts: string[] = ['def+'];
    if (evade) parts.push(`${evade}eva`);
    if (armor) parts.push(`${armor}arm`);
    lines.push(parts.join(' '));
  }

  const str = scale(record.str, surv);
  const intl = scale(record.intl, surv);
  const wis = scale(record.wis, surv);
  const agi = scale(record.agi, surv);
  const cha = scale(record.cha, surv);
  const con = scale(record.con, surv);
  if (str || intl || wis || agi || cha || con) {
    const parts: string[] = ['stat+'];
    if (str) parts.push(`${str}str`);
    if (intl) parts.push(`${intl}int`);
    if (wis) parts.push(`${wis}wis`);
    if (agi) parts.push(`${agi}agi`);
    if (cha) parts.push(`${cha}cha`);
    if (con) parts.push(`${con}con`);
    lines.push(parts.join(' '));
  }

  return lines;
}
