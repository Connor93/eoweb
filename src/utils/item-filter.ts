/** Pure, framework-free matching for the inventory / locker filter bar.
 *  Decides whether a stackable or instanced item passes the active
 *  filter so the same logic can be shared (and reasoned about) without
 *  any Preact / DOM dependency.
 *
 *  An item passes iff the text query AND the rarity chips AND the
 *  element chips all pass — each constraint trivially passes when it is
 *  empty. The text query is matched token-AND against a "haystack"
 *  built from the same formatters the tooltips use, so searching for
 *  "fire", "crit", a mod flavor name ("brutal"), or a base-stat word
 *  ("armor", "str") all work without a separate index.
 */
import type { EifRecord } from 'eolib';
import {
  type CombatElement,
  combatElementLabel,
  eolibToCombatElement,
} from '@/combat-overlay/element-colors';
import {
  type InstanceItem,
  type InstanceRarity,
  instanceRarityLabel,
} from '@/controllers';
import { formatInstanceBaseStats } from './format-instance-base-stats';
import { formatInstanceMod, prettyTarget } from './format-instance-mod';
import { getItemMeta } from './get-item-meta';

export interface ItemFilter {
  /** Raw search text; trimmed + lowercased at match time. */
  text: string;
  /** Active rarity chips. Empty = no rarity constraint. Instance-only:
   *  stackables have no rarity, so any active rarity chip excludes them. */
  rarities: Set<InstanceRarity>;
  /** Active element chips (the 6 real elements; no Plain). Empty = no
   *  element constraint. */
  elements: Set<CombatElement>;
}

export function emptyItemFilter(): ItemFilter {
  return { text: '', rarities: new Set(), elements: new Set() };
}

export function isItemFilterActive(f: ItemFilter): boolean {
  return f.text.trim().length > 0 || f.rarities.size > 0 || f.elements.size > 0;
}

/** Lowercased query tokens, whitespace-split, empties dropped. */
function queryTokens(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Every query token must appear somewhere in the haystack (AND). */
function matchesText(haystack: string, text: string): boolean {
  const tokens = queryTokens(text);
  if (tokens.length === 0) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function stackableHaystack(record: EifRecord): string {
  return [record.name, ...getItemMeta(record)].join(' ');
}

function instanceHaystack(
  inst: InstanceItem,
  record: EifRecord | undefined,
): string {
  const parts: string[] = [
    record?.name ?? `Item ${inst.baseItemId}`,
    instanceRarityLabel(inst.rarity),
    combatElementLabel(inst.element),
  ];
  if (record) parts.push(...formatInstanceBaseStats(record, inst.level));
  for (const m of inst.mods) {
    parts.push(formatInstanceMod(m), prettyTarget(m.target), m.target);
    if (m.condition) parts.push(m.condition);
  }
  return parts.join(' ');
}

export function stackableMatches(
  record: EifRecord | undefined,
  f: ItemFilter,
): boolean {
  // Unknown item id: keep it only while nothing is being filtered.
  if (!record) return !isItemFilterActive(f);
  // Rarity is an instance-only attribute — a rarity chip excludes stackables.
  if (f.rarities.size > 0) return false;
  if (
    f.elements.size > 0 &&
    !f.elements.has(eolibToCombatElement(record.element))
  ) {
    return false;
  }
  return matchesText(stackableHaystack(record), f.text);
}

export function instanceMatches(
  inst: InstanceItem,
  record: EifRecord | undefined,
  f: ItemFilter,
): boolean {
  if (f.rarities.size > 0 && !f.rarities.has(inst.rarity)) return false;
  if (f.elements.size > 0 && !f.elements.has(inst.element)) return false;
  return matchesText(instanceHaystack(inst, record), f.text);
}
