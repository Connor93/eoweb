import type { EifRecord, EquipmentPaperdoll } from 'eolib';
import {
  type InstanceItem,
  InstanceModKind,
  type InstanceRarity,
} from '@/controllers';
import { EquipmentSlot } from '@/equipment';
import { levelCurve } from './format-instance-base-stats';
import { prettyTarget } from './format-instance-mod';

/** Stat rows that can show a breakdown tooltip. `damage` covers the
 *  min–max range as one row. */
export type StatRowKey =
  | 'str'
  | 'int'
  | 'wis'
  | 'agi'
  | 'con'
  | 'cha'
  | 'maxHp'
  | 'maxTp'
  | 'damage'
  | 'accuracy'
  | 'evade'
  | 'armor';

/** One contributing equipped item inside a breakdown tooltip or an
 *  effects line. `level`/`rarity` are null for classic (non-instance)
 *  equips. `amountMax` is set only on the damage row (min–max). */
export interface GearSource {
  name: string;
  rarity: InstanceRarity | null;
  level: number | null;
  amount: number;
  amountMax?: number;
  /** Set on effects-line sources whose amount is a percent-kind mod
   *  value (0.1 = 10%); the tooltip renders ×100 with a % suffix. */
  isPercent?: boolean;
}

export interface StatBreakdown {
  gearTotal: number;
  /** Only on the damage row: gear total for the max end. */
  gearTotalMax?: number;
  sources: GearSource[];
}

/** Wire target → stat row for baked mods. Baked targets (mirrors
 *  REOSERV StatTarget::is_baked()) are the ONLY mod values included in
 *  stat-row gear sums, because they are the only ones inside the
 *  panel's server totals — live mods (everything else) appear in the
 *  Effects section instead. max_sp is baked but has no row (the tab
 *  doesn't show SP); computeEffects excludes it explicitly so it never
 *  leaks into the Effects list either. */
const BAKED_TARGET_TO_ROW: Record<string, StatRowKey | undefined> = {
  str: 'str',
  int: 'int',
  wis: 'wis',
  agi: 'agi',
  con: 'con',
  cha: 'cha',
  max_hp: 'maxHp',
  max_tp: 'maxTp',
};

const STAT_ROW_KEYS: StatRowKey[] = [
  'str',
  'int',
  'wis',
  'agi',
  'con',
  'cha',
  'maxHp',
  'maxTp',
  'damage',
  'accuracy',
  'evade',
  'armor',
];

function scale(value: number, factor: number): number {
  return Math.round(value * factor);
}

/** EIF base-stat contributions for one item at the given level factor,
 *  keyed by stat row. Mirrors REOSERV calculate_stats' `scale()` —
 *  round per item per stat. */
function eifContributions(
  record: EifRecord,
  factor: number,
): Partial<Record<StatRowKey, { amount: number; amountMax?: number }>> {
  const out: Partial<
    Record<StatRowKey, { amount: number; amountMax?: number }>
  > = {};
  const minDamage = scale(record.minDamage, factor);
  const maxDamage = scale(record.maxDamage, factor);
  if (minDamage || maxDamage) {
    out.damage = { amount: minDamage, amountMax: maxDamage };
  }
  const simple: [StatRowKey, number][] = [
    ['str', record.str],
    ['int', record.intl],
    ['wis', record.wis],
    ['agi', record.agi],
    ['con', record.con],
    ['cha', record.cha],
    ['maxHp', record.hp],
    ['maxTp', record.tp],
    ['accuracy', record.accuracy],
    ['evade', record.evade],
    ['armor', record.armor],
  ];
  for (const [row, raw] of simple) {
    const v = scale(raw, factor);
    if (v) out[row] = { amount: v };
  }
  return out;
}

export interface ClassicEquip {
  itemId: number;
  /** EquipmentSlot index 0..14; used only to skip slots occupied by
   *  instances. */
  slot: number;
}

/** Compute per-stat gear contributions from equipped instances +
 *  classic equips. Per the spec's rounding mirror rules: EIF stats
 *  round per item; baked mod values accumulate as floats per stat and
 *  round ONCE into the gear total (mirroring baked_mods::fold). The
 *  per-item source lines carry the raw (possibly fractional) amounts. */
export function computeGearBreakdown(
  equippedInstances: InstanceItem[],
  classicEquips: ClassicEquip[],
  getEif: (id: number) => EifRecord | null,
): Record<StatRowKey, StatBreakdown> {
  const result = {} as Record<StatRowKey, StatBreakdown>;
  for (const key of STAT_ROW_KEYS) {
    result[key] = { gearTotal: 0, sources: [] };
  }
  // Rounded EIF sums per row, and float accumulators for baked mod
  // values (the mod sums round ONCE at the end, mirroring fold()).
  const eifTotals: Partial<Record<StatRowKey, number>> = {};
  const eifTotalsMax: Partial<Record<StatRowKey, number>> = {};
  const modSums: Partial<Record<StatRowKey, number>> = {};

  const addEif = (
    perRow: Partial<Record<StatRowKey, { amount: number; amountMax?: number }>>,
  ) => {
    for (const key of STAT_ROW_KEYS) {
      const c = perRow[key];
      if (!c) continue;
      eifTotals[key] = (eifTotals[key] ?? 0) + c.amount;
      if (c.amountMax !== undefined) {
        eifTotalsMax[key] = (eifTotalsMax[key] ?? 0) + c.amountMax;
      }
    }
  };

  const occupiedSlots = new Set(equippedInstances.map((i) => i.equippedSlot));

  for (const inst of equippedInstances) {
    const record = getEif(inst.baseItemId);
    const name = record?.name ?? `Item ${inst.baseItemId}`;
    const factor = levelCurve(inst.level);
    // EIF-only contributions feed the totals before mods are folded in.
    const eifOnly = record ? eifContributions(record, factor) : {};
    addEif(eifOnly);
    // Per-row display amount for this item's source line: rounded EIF
    // part + raw baked-mod part (fractional values allowed on the line).
    const perRow = record ? eifContributions(record, factor) : {};
    for (const mod of inst.mods) {
      if (mod.kind !== InstanceModKind.Flat) continue;
      const row = BAKED_TARGET_TO_ROW[mod.target];
      if (!row) continue; // live mods → Effects section; max_sp → no row
      modSums[row] = (modSums[row] ?? 0) + mod.value;
      const existing = perRow[row];
      perRow[row] = {
        amount: (existing?.amount ?? 0) + mod.value,
        amountMax: existing?.amountMax,
      };
    }
    for (const key of STAT_ROW_KEYS) {
      const c = perRow[key];
      if (!c) continue;
      result[key].sources.push({
        name,
        rarity: inst.rarity,
        level: inst.level,
        amount: c.amount,
        amountMax: c.amountMax,
      });
    }
  }

  for (const eq of classicEquips) {
    if (!eq.itemId || occupiedSlots.has(eq.slot)) continue;
    const record = getEif(eq.itemId);
    if (!record) continue;
    const perRow = eifContributions(record, 1.0);
    addEif(perRow);
    for (const key of STAT_ROW_KEYS) {
      const c = perRow[key];
      if (!c) continue;
      result[key].sources.push({
        name: record.name,
        rarity: null,
        level: null,
        amount: c.amount,
        amountMax: c.amountMax,
      });
    }
  }

  for (const key of STAT_ROW_KEYS) {
    result[key].gearTotal =
      (eifTotals[key] ?? 0) + Math.round(modSums[key] ?? 0);
    if (eifTotalsMax[key] !== undefined) {
      result[key].gearTotalMax = eifTotalsMax[key];
    }
  }
  return result;
}

export type EffectGroupKey = 'offense' | 'defense' | 'utility';

export interface EffectLine {
  /** Display label, e.g. "Damage dealt", "Fire resistance". */
  label: string;
  /** Formatted merged value, e.g. "+12%", "-10%", "+5". */
  valueText: string;
  /** Element name for tinting ("fire", …) or null. */
  element: string | null;
  /** Server-rendered condition ("below 30% HP") or empty. */
  condition: string;
  sources: GearSource[];
}

const ELEMENT_TARGET =
  /^damage_(dealt|taken)_(fire|water|earth|wind|light|dark)$/;

const TARGET_GROUP: Record<string, EffectGroupKey> = {
  damage_dealt: 'offense',
  damage_dealt_fire: 'offense',
  damage_dealt_water: 'offense',
  damage_dealt_earth: 'offense',
  damage_dealt_wind: 'offense',
  damage_dealt_light: 'offense',
  damage_dealt_dark: 'offense',
  crit_chance: 'offense',
  crit_damage: 'offense',
  accuracy: 'offense',
  attack_speed: 'offense',
  status_duration_dealt: 'offense',
  healing_dealt: 'offense',
  damage_taken: 'defense',
  damage_taken_fire: 'defense',
  damage_taken_water: 'defense',
  damage_taken_earth: 'defense',
  damage_taken_wind: 'defense',
  damage_taken_light: 'defense',
  damage_taken_dark: 'defense',
  evasion: 'defense',
  armor: 'defense',
  crit_damage_taken: 'defense',
  crit_resistance: 'defense',
  slow_resistance: 'defense',
  poison_resistance: 'defense',
  root_resistance: 'defense',
  status_duration_self: 'defense',
  healing_received: 'defense',
  // everything else (xp_gain, gold_gain, rep_gain, drop_chance,
  // magic_find, hp_regen, tp_regen, sp_regen, move_speed,
  // mana_cost_reduction, cooldown_reduction, unknown future targets)
  // falls through to 'utility'.
};

function groupFor(target: string): EffectGroupKey {
  return TARGET_GROUP[target] ?? 'utility';
}

/** Format a merged numeric value: percent kinds ×100 with a % suffix,
 *  ≤1 decimal; flat values ≤1 decimal. */
function formatValue(kind: InstanceModKind, value: number): string {
  const isPercent = kind !== InstanceModKind.Flat;
  const display = isPercent ? value * 100 : value;
  const sign = display >= 0 ? '+' : '';
  const fixed =
    Math.abs(display % 1) < 0.05 ? display.toFixed(0) : display.toFixed(1);
  return `${sign}${fixed}${isPercent ? '%' : ''}`;
}

/** Display label + sign handling for a target. The two inversions from
 *  the spec: elemental damage_taken lines render as positive
 *  "<Element> resistance" (sign flipped); plain damage_taken stays
 *  literal. */
function effectDisplay(
  target: string,
  value: number,
): { label: string; value: number; element: string | null } {
  const m = target.match(ELEMENT_TARGET);
  if (m) {
    const element = m[2];
    const elementLabel = element.charAt(0).toUpperCase() + element.slice(1);
    if (m[1] === 'taken') {
      return { label: `${elementLabel} resistance`, value: -value, element };
    }
    return { label: `${elementLabel} damage`, value, element };
  }
  return { label: prettyTarget(target), value, element: null };
}

export interface EffectGroup {
  group: EffectGroupKey;
  lines: EffectLine[];
}

/** Aggregate live (non-baked) mods across equipped instances. Merge
 *  key: target + kind + condition. percent_additive and flat sum;
 *  percent_multiplicative combines as (1+a)(1+b)-1. Conditional mods
 *  never merge with unconditional ones. `getEif` resolves item names
 *  for the per-line source tooltips. */
export function computeEffects(
  equippedInstances: InstanceItem[],
  getEif: (id: number) => EifRecord | null,
): EffectGroup[] {
  type Bucket = {
    target: string;
    kind: InstanceModKind;
    condition: string;
    value: number;
    sources: GearSource[];
  };
  const buckets = new Map<string, Bucket>();

  for (const inst of equippedInstances) {
    const itemName = getEif(inst.baseItemId)?.name ?? `Item ${inst.baseItemId}`;
    for (const mod of inst.mods) {
      if (BAKED_TARGET_TO_ROW[mod.target] || mod.target === 'max_sp') continue;
      const key = `${mod.target}|${mod.kind}|${mod.condition}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          target: mod.target,
          kind: mod.kind,
          condition: mod.condition,
          value: mod.kind === InstanceModKind.PercentMultiplicative ? 1 : 0,
          sources: [],
        };
        buckets.set(key, bucket);
      }
      if (mod.kind === InstanceModKind.PercentMultiplicative) {
        bucket.value *= 1 + mod.value;
      } else {
        bucket.value += mod.value;
      }
      bucket.sources.push({
        name: itemName,
        rarity: inst.rarity,
        level: inst.level,
        amount: mod.value,
        isPercent: mod.kind !== InstanceModKind.Flat,
      });
    }
  }

  const groups: Record<EffectGroupKey, EffectLine[]> = {
    offense: [],
    defense: [],
    utility: [],
  };
  for (const b of buckets.values()) {
    const merged =
      b.kind === InstanceModKind.PercentMultiplicative ? b.value - 1 : b.value;
    const d = effectDisplay(b.target, merged);
    groups[groupFor(b.target)].push({
      label: d.label,
      valueText: formatValue(b.kind, d.value),
      element: d.element,
      condition: b.condition,
      sources: b.sources,
    });
  }
  for (const key of Object.keys(groups) as EffectGroupKey[]) {
    groups[key].sort((a, b) => a.label.localeCompare(b.label));
  }
  return (['offense', 'defense', 'utility'] as EffectGroupKey[])
    .filter((g) => groups[g].length > 0)
    .map((g) => ({ group: g, lines: groups[g] }));
}

/** Flatten the paperdoll into (slot, itemId) pairs for
 *  computeGearBreakdown. Slot indices match EquipmentSlot 0..14. */
export function classicEquipsFromPaperdoll(
  equipment: EquipmentPaperdoll,
): ClassicEquip[] {
  return [
    { slot: EquipmentSlot.Boots, itemId: equipment.boots },
    { slot: EquipmentSlot.Accessory, itemId: equipment.accessory },
    { slot: EquipmentSlot.Gloves, itemId: equipment.gloves },
    { slot: EquipmentSlot.Belt, itemId: equipment.belt },
    { slot: EquipmentSlot.Armor, itemId: equipment.armor },
    { slot: EquipmentSlot.Necklace, itemId: equipment.necklace },
    { slot: EquipmentSlot.Hat, itemId: equipment.hat },
    { slot: EquipmentSlot.Shield, itemId: equipment.shield },
    { slot: EquipmentSlot.Weapon, itemId: equipment.weapon },
    { slot: EquipmentSlot.Ring1, itemId: equipment.ring[0] },
    { slot: EquipmentSlot.Ring2, itemId: equipment.ring[1] },
    { slot: EquipmentSlot.Armlet1, itemId: equipment.armlet[0] },
    { slot: EquipmentSlot.Armlet2, itemId: equipment.armlet[1] },
    { slot: EquipmentSlot.Bracer1, itemId: equipment.bracer[0] },
    { slot: EquipmentSlot.Bracer2, itemId: equipment.bracer[1] },
  ];
}
