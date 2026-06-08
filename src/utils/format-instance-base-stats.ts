import type { EifRecord } from 'eolib';

/** Mirrors REOSERV's `level_curve(level)` formula (linear, 1.0 + 0.1 ×
 *  (level − 1)). Keep this in sync with `src/items/level_curve.rs` —
 *  if the server formula changes the client display will drift until
 *  this is updated. */
function levelCurve(level: number): number {
  return 1.0 + 0.1 * (Math.max(level, 1) - 1);
}

function scale(value: number, factor: number): number {
  return Math.round(value * factor);
}

/** Produce the level-scaled base-stat lines for an instanced item's
 *  tooltip. Shows the same shape as `getItemMeta`'s damage / hp / hit /
 *  def / stat lines but multiplied by `level_curve(item_level)` so the
 *  player sees the actual numbers combat will use, not the raw pub
 *  values. Stat *requirements* (`levelRequirement`, `strRequirement`,
 *  etc.) aren't scaled and aren't surfaced here — they're on the base
 *  item and unchanged by rolling. */
export function formatInstanceBaseStats(
  record: EifRecord,
  level: number,
): string[] {
  const lines: string[] = [];
  const factor = levelCurve(level);

  const minDamage = scale(record.minDamage, factor);
  const maxDamage = scale(record.maxDamage, factor);
  if (minDamage || maxDamage) {
    lines.push(`damage: ${minDamage} - ${maxDamage}`);
  }

  const hp = scale(record.hp, factor);
  const tp = scale(record.tp, factor);
  if (hp || tp) {
    const parts: string[] = ['add+'];
    if (hp) parts.push(`${hp}hp`);
    if (tp) parts.push(`${tp}tp`);
    lines.push(parts.join(' '));
  }

  const accuracy = scale(record.accuracy, factor);
  if (accuracy) {
    lines.push(`plus+ ${accuracy}hit`);
  }

  const evade = scale(record.evade, factor);
  const armor = scale(record.armor, factor);
  if (evade || armor) {
    const parts: string[] = ['def+'];
    if (evade) parts.push(`${evade}eva`);
    if (armor) parts.push(`${armor}arm`);
    lines.push(parts.join(' '));
  }

  const str = scale(record.str, factor);
  const intl = scale(record.intl, factor);
  const wis = scale(record.wis, factor);
  const agi = scale(record.agi, factor);
  const cha = scale(record.cha, factor);
  const con = scale(record.con, factor);
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
