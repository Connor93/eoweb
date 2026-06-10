# Stats Panel Effective View Implementation Plan

> **✅ COMPLETED 2026-06-10** — all 8 tasks executed via subagent-driven development (REOSERV `542a60b..46c9445`, eoweb `0622bcc..c903e9f`). Notable mid-execution additions: sign byte on the per-mod wire (pre-existing negative-value corruption found by the codec round-trip test), codec hardening (length/value clamps), `equipRev` subscription (classic-equip changes weren't invalidating the breakdown memo), client mirror of the server's conditional-baked-mod skip. In-game play-test checklist in Task 8 still pending.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-item breakdown tooltips on every stat row, HP/TP rows in the derived column, and a grouped "Effects" section aggregating live gear mods — in eoweb's character dialog Stats tab.

**Architecture:** Client-side computation from data eoweb already holds (per-mod target/kind/value on the family-54 wire, mirrored `levelCurve`, EIF records). `Base = serverTotal − gearTotal` keeps the server authoritative. One server wire addition: a server-rendered condition string per mod entry so conditional mods ("below 30% HP") can be annotated without a client modifiers cache. Spec: `docs/superpowers/specs/2026-06-10-stats-panel-effective-view-design.md` — read it before starting; the **baked vs live rule** there governs all the math.

**Tech Stack:** REOSERV (Rust, tokio; tests via `cargo test --bin reoserv` — binary-only crate, `--lib` fails). eoweb (Preact + TS; NO test runner — verify with `tsc --noEmit` and `npx biome check --write` (lefthook runs biome on commit; run it first or the commit fails)).

**Repos:** Tasks 1–2 in `/Users/cfraser/Projects/reoserv` (commit to master, prefix style `instance:`/`effects:`). Tasks 3–8 in `/Users/cfraser/Projects/eoweb` (commit to master, prefix style `character:`/`instance:`). Both working trees may carry unrelated uncommitted changes — stage only files you touched, never `git add -A`.

---

### Task 1: REOSERV — `condition_display` formatter

Renders a `Condition` as a short player-facing string for the wire. Pure core + thin wrapper that resolves zone names from `ZONES_DB`.

**Files:**
- Modify: `src/effects/condition.rs` (add functions + tests at the end, before the existing `#[cfg(test)] mod tests` closing or inside it)

- [ ] **Step 1: Write failing tests** (append inside the existing `tests` module in `src/effects/condition.rs`)

```rust
    #[test]
    fn condition_display_renders_hp_tp_thresholds() {
        assert_eq!(
            condition_display_with(&Condition::SelfHpBelowPct { pct: 30 }, None),
            "below 30% HP"
        );
        assert_eq!(
            condition_display_with(&Condition::SelfHpAbovePct { pct: 80 }, None),
            "above 80% HP"
        );
        assert_eq!(
            condition_display_with(&Condition::SelfTpBelowPct { pct: 50 }, None),
            "below 50% TP"
        );
        assert_eq!(
            condition_display_with(&Condition::SelfTpAbovePct { pct: 50 }, None),
            "above 50% TP"
        );
    }

    #[test]
    fn condition_display_renders_target_zone_element() {
        assert_eq!(
            condition_display_with(&Condition::TargetType { value: "aggressive".into() }, None),
            "vs aggressive"
        );
        assert_eq!(
            condition_display_with(&Condition::CurrentZone { zone_id: 3 }, Some("Aeven")),
            "in Aeven"
        );
        assert_eq!(
            condition_display_with(&Condition::CurrentZone { zone_id: 3 }, None),
            "in zone 3"
        );
        assert_eq!(
            condition_display_with(&Condition::DamageElement { element: Element::Fire }, None),
            "fire damage only"
        );
    }

    #[test]
    fn condition_display_renders_equipment_kinds() {
        assert_eq!(
            condition_display_with(&Condition::WeaponKind { kind: "sword".into() }, None),
            "with sword"
        );
        assert_eq!(
            condition_display_with(&Condition::EquippedOffhand { kind: "shield".into() }, None),
            "with shield offhand"
        );
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --bin reoserv condition_display`
Expected: FAIL — `condition_display_with` not found.

- [ ] **Step 3: Implement** (in `src/effects/condition.rs`, below `condition_matches`)

```rust
/// Player-facing display string for a condition, pushed to the client
/// on the per-mod wire block so eoweb can annotate conditional mods
/// without a modifiers cache. `zone_name` is the pre-resolved name for
/// `CurrentZone` (the caller looks it up; `None` falls back to the id).
pub fn condition_display_with(cond: &Condition, zone_name: Option<&str>) -> String {
    match cond {
        Condition::TargetType { value } => format!("vs {}", value),
        Condition::CurrentZone { zone_id } => match zone_name {
            Some(name) => format!("in {}", name),
            None => format!("in zone {}", zone_id),
        },
        Condition::DamageElement { element } => {
            format!("{:?} damage only", element).to_lowercase()
        }
        Condition::SelfHpAbovePct { pct } => format!("above {}% HP", pct),
        Condition::SelfHpBelowPct { pct } => format!("below {}% HP", pct),
        Condition::SelfTpAbovePct { pct } => format!("above {}% TP", pct),
        Condition::SelfTpBelowPct { pct } => format!("below {}% TP", pct),
        Condition::WeaponKind { kind } => format!("with {}", kind),
        Condition::EquippedOffhand { kind } => format!("with {} offhand", kind),
    }
}

/// Wrapper that resolves the zone name from `ZONES_DB` for
/// `CurrentZone` conditions. Use this at the wire-build site.
pub fn condition_display(cond: &Condition) -> String {
    let zone_name = match cond {
        Condition::CurrentZone { zone_id } => crate::ZONES_DB
            .load()
            .zones
            .iter()
            .find(|z| z.zone_id == *zone_id)
            .map(|z| z.name.clone()),
        _ => None,
    };
    condition_display_with(cond, zone_name.as_deref())
}
```

Note: the lowercase trick for `DamageElement` lowercases the whole string including "HP"-free text — output is e.g. `"fire damage only"`. The test asserts exactly that. `format!("{:?}", Element::Fire)` is `"Fire"`.

Export from `src/effects/mod.rs`: extend the condition line to

```rust
pub use condition::{Condition, condition_display, condition_matches};
```

(`condition_display_with` stays module-private to `condition.rs` except for tests — tests live in the same module so no export needed.)

- [ ] **Step 4: Run tests**

Run: `cargo test --bin reoserv condition_display && cargo check`
Expected: 3 tests PASS; check may warn `condition_display` unused — acceptable until Task 2 (do NOT add `#[allow(dead_code)]`; Task 2 lands in the same session).

- [ ] **Step 5: Commit**

```bash
git add src/effects/condition.rs src/effects/mod.rs
git commit -m "effects: condition_display formatter for wire annotations"
```

---

### Task 2: REOSERV — shared mod codec + condition string on the wire

`InstanceListMod` gains `condition: String` (empty = unconditional). The per-mod read/write blocks are currently copy-pasted across four deep packet files (a known gotcha) — extract a shared codec first, then the new field is a one-place change.

**Files:**
- Modify: `src/deep/instance_list_server_packet.rs` (struct + use shared codec)
- Create: codec functions in `src/deep/mod.rs` (check how `src/deep/mod.rs` declares/re-exports the packet modules and match style)
- Modify: `src/deep/chest_instance_list_server_packet.rs`, `src/deep/trade_instance_list_server_packet.rs`, `src/deep/instance_ground_add_server_packet.rs` (use shared codec)
- Modify: `src/character/instances.rs` (`build_instance_list_mod` fills `condition`)

- [ ] **Step 1: Add the field** (in `src/deep/instance_list_server_packet.rs`)

```rust
pub struct InstanceListMod {
    pub mod_id: String,
    pub name: String,
    pub kind: i32,
    pub target: String,
    pub value_x100: i32,
    /// Server-rendered condition annotation ("below 30% HP"); empty
    /// when the mod is unconditional. See effects::condition_display.
    pub condition: String,
}
```

- [ ] **Step 2: Add the shared codec** (in `src/deep/mod.rs`, near the module declarations)

```rust
use eolib::data::{EoReader, EoSerializeError, EoWriter};

/// Shared per-mod wire block used by all four instance-carrying packets
/// (InstanceList, ChestInstanceList, TradeInstanceList, InstanceGroundAdd).
/// Layout: len+bytes mod_id, len+bytes name, kind char, len+bytes target,
/// value_x100 int, len+bytes condition.
pub fn write_instance_mod(
    writer: &mut EoWriter,
    m: &InstanceListMod,
) -> Result<(), EoSerializeError> {
    let mod_id_bytes = m.mod_id.as_bytes();
    writer.add_char(mod_id_bytes.len() as i32)?;
    writer.add_bytes(mod_id_bytes);
    let name_bytes = m.name.as_bytes();
    writer.add_char(name_bytes.len() as i32)?;
    writer.add_bytes(name_bytes);
    writer.add_char(m.kind)?;
    let target_bytes = m.target.as_bytes();
    writer.add_char(target_bytes.len() as i32)?;
    writer.add_bytes(target_bytes);
    writer.add_int(m.value_x100)?;
    let condition_bytes = m.condition.as_bytes();
    writer.add_char(condition_bytes.len() as i32)?;
    writer.add_bytes(condition_bytes);
    Ok(())
}

/// Inverse of `write_instance_mod`.
pub fn read_instance_mod(reader: &EoReader) -> InstanceListMod {
    let mod_id_len = reader.get_char() as usize;
    let mod_id = String::from_utf8(reader.get_bytes(mod_id_len)).unwrap_or_default();
    let name_len = reader.get_char() as usize;
    let name = String::from_utf8(reader.get_bytes(name_len)).unwrap_or_default();
    let kind = reader.get_char();
    let target_len = reader.get_char() as usize;
    let target = String::from_utf8(reader.get_bytes(target_len)).unwrap_or_default();
    let value_x100 = reader.get_int();
    let condition_len = reader.get_char() as usize;
    let condition = String::from_utf8(reader.get_bytes(condition_len)).unwrap_or_default();
    InstanceListMod {
        mod_id,
        name,
        kind,
        target,
        value_x100,
        condition,
    }
}
```

Adjust imports/visibility to match `src/deep/mod.rs` conventions (the packet structs are likely re-exported there — `InstanceListMod` must be in scope).

- [ ] **Step 3: Replace all four duplicated blocks.** In each of the four packet files, replace the inline per-mod loop bodies:
  - serialize side: the block from `let mod_id_bytes = m.mod_id.as_bytes();` through `writer.add_int(m.value_x100)?;` becomes `super::write_instance_mod(writer, m)?;`
  - deserialize side: the block from `let mod_id_len = ...` through `mods.push(InstanceListMod { ... });` becomes `mods.push(super::read_instance_mod(reader));`

  Do this in all four: `instance_list_server_packet.rs`, `chest_instance_list_server_packet.rs`, `trade_instance_list_server_packet.rs`, `instance_ground_add_server_packet.rs`. Their field orders are identical today — if any file deviates (compare before deleting!), STOP and report rather than silently changing wire order.

- [ ] **Step 4: Fill the condition in `build_instance_list_mod`** (`src/character/instances.rs`)

```rust
    InstanceListMod {
        mod_id: mod_id.to_string(),
        name: definition
            .map(|d| d.name.clone())
            .unwrap_or_else(|| mod_id.to_string()),
        kind: definition
            .map(|d| modifier_kind_to_wire(d.kind))
            .unwrap_or(0),
        target: definition
            .map(|d| stat_target_to_wire(d.target))
            .unwrap_or_default(),
        value_x100: (value * 100.0).round() as i32,
        condition: definition
            .and_then(|d| d.when.as_ref())
            .map(crate::effects::condition_display)
            .unwrap_or_default(),
    }
```

- [ ] **Step 5: Fix compile fallout.** `cargo check` will flag every other `InstanceListMod { ... }` construction (the three other packet files' deserializers are now gone; tests or other builders may remain — `grep -rn "InstanceListMod {" src/`). Add `condition: String::new()` or use the new codec as appropriate. If any inline round-trip tests exist in the deep packet files, extend their fixtures with a non-empty condition string to cover the new field.

- [ ] **Step 6: Run tests**

Run: `cargo check && cargo test --bin reoserv`
Expected: clean, all tests pass (count was 129 before this work).

- [ ] **Step 7: Commit**

```bash
git add src/deep/ src/character/instances.rs
git commit -m "instance: per-mod condition string on the wire via shared codec"
```

---

### Task 3: eoweb — parse the condition string

**Files:**
- Modify: `src/handlers/instance.ts` (`readMod`, ~line 34)
- Modify: `src/controllers/instance-controller.ts` (`InstanceMod` interface, ~line 47)

- [ ] **Step 1: Extend `InstanceMod`** (instance-controller.ts)

```ts
export interface InstanceMod {
  modId: string;
  /** Designer-facing display name resolved server-side from
   *  MODIFIER_DB at push time. Falls back to `modId` if the mod is
   *  no longer in the pool. */
  name: string;
  kind: InstanceModKind;
  /** snake_case StatTarget variant — e.g. `damage_dealt_fire`,
   *  `magic_find`, `str`. The client prettifies this for display so
   *  the player sees *what stat* the mod actually affects. */
  target: string;
  value: number;
  /** Server-rendered condition annotation ("below 30% HP"); empty
   *  string when the mod is unconditional. */
  condition: string;
}
```

- [ ] **Step 2: Extend `readMod`** (instance.ts) — append after `valueX100`:

```ts
function readMod(reader: EoReader): InstanceMod {
  const modIdLen = reader.getChar();
  const modIdBytes = reader.getBytes(modIdLen);
  const modId = new TextDecoder().decode(new Uint8Array(modIdBytes));
  const nameLen = reader.getChar();
  const nameBytes = reader.getBytes(nameLen);
  const name = new TextDecoder().decode(new Uint8Array(nameBytes));
  const kind = reader.getChar();
  const targetLen = reader.getChar();
  const targetBytes = reader.getBytes(targetLen);
  const target = new TextDecoder().decode(new Uint8Array(targetBytes));
  // Sign byte (0 = +, 1 = −): eolib ints can't encode negatives, and
  // resist mods roll negative values. Added server-side in the same
  // change as the condition field.
  const negative = reader.getChar() === 1;
  const valueX100 = reader.getInt() * (negative ? -1 : 1);
  const conditionLen = reader.getChar();
  const conditionBytes = reader.getBytes(conditionLen);
  const condition = new TextDecoder().decode(new Uint8Array(conditionBytes));
  return { modId, name, kind, target, value: valueX100 / 100, condition };
}
```

All four packet parsers share `readMod`, so this is the only wire change. `grep -n "condition" src/handlers/instance.ts` to confirm no other site constructs an `InstanceMod` literal (if one does, add `condition: ''`). Also check `src/controllers/instance-controller.ts` for `GroundInstanceItem`/other constructors of `InstanceMod`.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx biome check --write src/`
Expected: tsc clean (it will surface every `InstanceMod` literal missing `condition` — fix each with the parsed value or `''`).

- [ ] **Step 4: Manual smoke (server + client running):** `cargo run` the server with Tasks 1–2 built; log in, `$gi` an item until a roll includes `low_hp_damage` (or grant repeatedly); confirm the inventory tooltip still renders mods (the existing UI ignores `condition` for now — no visual change expected, just no parse desync in inventory, chest, trade, and ground tooltips).

- [ ] **Step 5: Commit**

```bash
git add src/handlers/instance.ts src/controllers/instance-controller.ts
git commit -m "instance: parse per-mod condition annotation from the wire"
```

---

### Task 4: eoweb — `stat-breakdown.ts` data layer

Pure functions; no client/network state. Read the spec's **baked vs live rule** first — it decides which mods go where.

**Files:**
- Modify: `src/utils/format-instance-base-stats.ts` (export `levelCurve`)
- Modify: `src/utils/format-instance-mod.ts` (export `prettyTarget`)
- Create: `src/utils/stat-breakdown.ts`
- Modify: `src/utils/index.ts` (re-export the new module's public API)

- [ ] **Step 1: Export the two existing helpers.** In `format-instance-base-stats.ts` change `function levelCurve` to `export function levelCurve` (keep the sync-warning doc comment). In `format-instance-mod.ts` change `function prettyTarget` to `export function prettyTarget`.

- [ ] **Step 2: Create `src/utils/stat-breakdown.ts`**

```ts
import type { EifRecord } from 'eolib';
import {
  type InstanceItem,
  type InstanceMod,
  InstanceModKind,
  type InstanceRarity,
} from '@/controllers';
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
  const out: Partial<Record<StatRowKey, { amount: number; amountMax?: number }>> = {};
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
    result[key].gearTotal = (eifTotals[key] ?? 0) + Math.round(modSums[key] ?? 0);
    if (eifTotalsMax[key] !== undefined) {
      result[key].gearTotalMax = eifTotalsMax[key];
    }
  }
  return result;
}
```

- [ ] **Step 3: Add `computeEffects` to the same file**

```ts
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

const ELEMENT_TARGET = /^damage_(dealt|taken)_(fire|water|earth|wind|light|dark)$/;

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
    const itemName =
      getEif(inst.baseItemId)?.name ?? `Item ${inst.baseItemId}`;
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
```

**Sign-flip detail:** `effectDisplay` flips the value for elemental resistance lines, but `formatValue` receives the flipped value — make sure the call passes `d.value` (flipped), as shown.

- [ ] **Step 4: Helper for classic equips** (same file)

```ts
import type { EquipmentPaperdoll } from 'eolib';
import { EquipmentSlot } from '@/equipment';

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
```

- [ ] **Step 5: Re-export** from `src/utils/index.ts` (match existing export style): `computeGearBreakdown`, `computeEffects`, `classicEquipsFromPaperdoll`, and the types `StatRowKey`, `StatBreakdown`, `GearSource`, `EffectGroup`, `EffectLine`.

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit && npx biome check --write src/`
Expected: clean. (No test runner exists; the math gets exercised in Task 7's manual verification.)

- [ ] **Step 7: Commit**

```bash
git add src/utils/
git commit -m "character: stat breakdown + effects aggregation data layer"
```

---

### Task 5: eoweb — `BreakdownTooltip` component

**Files:**
- Create: `src/ui/components/breakdown-tooltip.tsx`
- Modify: `src/ui/components/index.ts` (re-export; check the existing barrel style)

- [ ] **Step 1: Create the component.** Hover via the same `group`/`group-hover` pattern as EquipSlot's tooltip (character-dialog.tsx:219-243); touch via pointerdown + outside-touch clear (same file, lines 112-125). Rarity text colors mirror the border classes (`rarityBorderClass`): Common → default, Rare → `text-info`, Epic → `text-secondary`, Legendary → `text-warning`.

```tsx
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { InstanceRarity } from '@/controllers';
import type { GearSource } from '@/utils';

function rarityTextClass(r: InstanceRarity | null): string {
  switch (r) {
    case InstanceRarity.Rare:
      return 'text-info';
    case InstanceRarity.Epic:
      return 'text-secondary';
    case InstanceRarity.Legendary:
      return 'text-warning';
    default:
      return '';
  }
}

function formatAmount(s: GearSource): string {
  const fmt = (v: number) =>
    Math.abs(v % 1) < 0.05 ? v.toFixed(0) : v.toFixed(1);
  const scale = s.isPercent ? 100 : 1;
  const suffix = s.isPercent ? '%' : '';
  const sign = s.amount >= 0 ? '+' : '';
  if (s.amountMax !== undefined) {
    return `${sign}${fmt(s.amount * scale)}-${fmt(s.amountMax * scale)}${suffix}`;
  }
  return `${sign}${fmt(s.amount * scale)}${suffix}`;
}

interface Props {
  /** "Base (class & level)" line; omit for effects lines (sources only). */
  baseLabel?: string;
  baseValue?: string;
  sources: GearSource[];
  children: ComponentChildren;
}

/** Hover/touch tooltip listing the base line + one rarity-colored line
 *  per contributing equipped item. Wraps its children as the hover
 *  target. */
export function BreakdownTooltip({ baseLabel, baseValue, sources, children }: Props) {
  const [touchOpen, setTouchOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!ref.current?.contains(e.target as Node)) {
        setTouchOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const hasContent = baseLabel !== undefined || sources.length > 0;

  return (
    <span
      ref={ref}
      class='group relative'
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') setTouchOpen(true);
      }}
    >
      {children}
      {hasContent && (
        <div
          class={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-max max-w-52 -translate-x-1/2 rounded bg-base-300 px-2 py-1 text-left text-xs shadow-lg ${touchOpen ? 'block' : 'hidden group-hover:block'}`}
        >
          {baseLabel !== undefined && (
            <div class='flex justify-between gap-3'>
              <span class='opacity-70'>{baseLabel}</span>
              <span>{baseValue}</span>
            </div>
          )}
          {sources.map((s, i) => (
            <div key={i} class='flex justify-between gap-3'>
              <span class={rarityTextClass(s.rarity)}>
                {s.level !== null ? `Lv${s.level} ` : ''}
                {s.name}
              </span>
              <span class='text-success'>{formatAmount(s)}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Re-export** in `src/ui/components/index.ts` following the existing pattern.

- [ ] **Step 3: Typecheck + lint, commit**

Run: `npx tsc --noEmit && npx biome check --write src/`

```bash
git add src/ui/components/
git commit -m "character: BreakdownTooltip shared hover component"
```

---

### Task 6: eoweb — StatsTab breakdown rows + HP/TP

**Files:**
- Modify: `src/ui/in-game/dialogs/character-dialog.tsx` (`StatsTab`, ~line 418)
- Modify: `src/locale.ts` (stats section, all 4 locales)

- [ ] **Step 1: Locale strings.** In every one of the **4** locale objects (grep `labelDmg` — 4 hits), extend `stats`:

```ts
      labelHp: 'HP',
      labelTp: 'TP',
      labelBaseClassLevel: 'Base (class & level)',
      labelEffects: 'Effects',
      groupOffense: 'Offense',
      groupDefense: 'Defense',
      groupUtility: 'Utility',
      effectsEmpty: 'No effects from equipped gear',
```

(English values in all locales, matching how recent strings were handled.)

- [ ] **Step 2: Breakdown wiring in `StatsTab`.** Add imports (`computeGearBreakdown`, `classicEquipsFromPaperdoll`, type `StatRowKey`, `BreakdownTooltip`), and a memo that recomputes on instance/equipment change. `usePlayerStats` already re-renders on stats/equipment changes; add the instance subscription:

```tsx
  const [instanceRev, setInstanceRev] = useState(0);
  useEffect(() => {
    const handler = () => setInstanceRev((n) => n + 1);
    client.instanceController.subscribeChanged(handler);
    return () => client.instanceController.unsubscribeChanged(handler);
  }, [client]);

  const breakdown = useMemo(() => {
    const equipped = client.instanceController
      .list()
      .filter((i) => i.equippedSlot >= 0);
    return computeGearBreakdown(
      equipped,
      classicEquipsFromPaperdoll(client.equipment),
      (id) => (id ? client.getEifRecordById(id) : null),
    );
    // instanceRev is the change signal; secondary/base stats refresh via usePlayerStats
  }, [client, instanceRev]);
```

(If `client.getEifRecordById` returns `undefined` rather than `null`, adapt with `?? null`. Check `client.equipment` is the live own-paperdoll — it is set by `instanceController.applyEquipmentSlot` and classic equip handlers.)

- [ ] **Step 3: Render the rows with tooltips.** Replace the `baseRows` / `derivedRows` render so each value is wrapped in `BreakdownTooltip`. Base = displayed total − gearTotal:

```tsx
  const statRow = (key: StatRowKey, total: number, display?: string) => {
    const b = breakdown[key];
    const base = total - b.gearTotal;
    return (
      <BreakdownTooltip
        baseLabel={locale.stats.labelBaseClassLevel}
        baseValue={String(base)}
        sources={b.sources}
      >
        <span class={b.sources.length ? 'border-b border-current/30 border-dotted' : ''}>
          {display ?? total.toLocaleString()}
        </span>
      </BreakdownTooltip>
    );
  };
```

Base column rows become `statRow('str', base.str)` etc. Derived column becomes (order: Damage, Accuracy, Evade, Armor, HP, TP):

```tsx
  const damageBase = `${(secondary.minDamage - (breakdown.damage.gearTotal ?? 0)).toLocaleString()} - ${(secondary.maxDamage - (breakdown.damage.gearTotalMax ?? 0)).toLocaleString()}`;
```

— the damage row doesn't fit `statRow` (its base is a range, not `total − gearTotal`): render it directly with `BreakdownTooltip`, passing `baseValue={damageBase}` and the full range `${secondary.minDamage} - ${secondary.maxDamage}` as the visible child. HP/TP rows use `statRow('maxHp', maxHp)` / `statRow('maxTp', maxTp)` with values from `usePlayerStats` (extend the destructuring in StatsTab — the hook already returns them).

Keep the train buttons and stat-points header untouched. Tooltips render for the own character only — `StatsTab` is already own-character-gated for training; gate the tooltip wrap on `isOwnCharacter` and fall back to the plain value otherwise.

- [ ] **Step 4: Typecheck + lint + visual check.** `npx tsc --noEmit && npx biome check --write src/`. Run the dev client (`npm run dev`) against a running server; equip a modded item; hover STR — per-item lines and Base must sum to the displayed total exactly (the damage row: min and max each).

- [ ] **Step 5: Commit**

```bash
git add src/ui/in-game/dialogs/character-dialog.tsx src/locale.ts
git commit -m "character: stat rows get per-item breakdown tooltips + HP/TP rows"
```

---

### Task 7: eoweb — EffectsSection

**Files:**
- Modify: `src/ui/in-game/dialogs/character-dialog.tsx` (add `EffectsSection`, render below the stat columns in `StatsTab`)

- [ ] **Step 1: Component** (in character-dialog.tsx, near StatsTab):

```tsx
const GROUP_HEADER_CLASS: Record<string, string> = {
  offense: 'text-error/80',
  defense: 'text-info/80',
  utility: 'text-secondary/80',
};

function EffectsSection() {
  const client = useClient();
  const { locale } = useLocale();
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const handler = () => setRev((n) => n + 1);
    client.instanceController.subscribeChanged(handler);
    return () => client.instanceController.unsubscribeChanged(handler);
  }, [client]);

  const groups = useMemo(() => {
    const equipped = client.instanceController
      .list()
      .filter((i) => i.equippedSlot >= 0);
    return computeEffects(equipped, (id) =>
      id ? (client.getEifRecordById(id) ?? null) : null,
    );
  }, [client, rev]);

  const groupLabel: Record<string, string> = {
    offense: locale.stats.groupOffense,
    defense: locale.stats.groupDefense,
    utility: locale.stats.groupUtility,
  };

  return (
    <div class='flex flex-col gap-0.5 border-base-content/10 border-t pt-2'>
      <span class='text-primary/60 text-xs uppercase tracking-wide'>
        {locale.stats.labelEffects}
      </span>
      {groups.length === 0 && (
        <span class='text-base-content/40 text-xs'>
          {locale.stats.effectsEmpty}
        </span>
      )}
      {groups.map((g) => (
        <div key={g.group}>
          <div class={`text-xs ${GROUP_HEADER_CLASS[g.group]}`}>
            {groupLabel[g.group]}
          </div>
          {g.lines.map((line) => (
            <div key={`${line.label}|${line.condition}`} class='pl-2'>
              <BreakdownTooltip sources={line.sources}>
                <span
                  class='text-xs'
                  style={
                    line.element
                      ? { color: combatElementColor(elementFromName(line.element)) }
                      : undefined
                  }
                >
                  <span class='text-success'>{line.valueText}</span> {line.label}
                  {line.condition && (
                    <span class='opacity-50'> ({line.condition})</span>
                  )}
                </span>
              </BreakdownTooltip>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

`elementFromName`: check `src/combat-overlay` for an existing name→`CombatElement` mapping; if none exists, add a small local map (`{ fire: CombatElement.Fire, water: CombatElement.Water, earth: CombatElement.Earth, wind: CombatElement.Wind, light: CombatElement.Light, dark: CombatElement.Dark }`). For element-tinted lines, the element color applies to the label; keep the value in `text-success` as shown.

- [ ] **Step 2: Render it** at the bottom of `StatsTab`'s root flex column (after the two-column div), gated to `isOwnCharacter`.

- [ ] **Step 3: Typecheck + lint + visual check.** Equip a fire-damage weapon with a conditional mod: Offense group shows the tinted fire line and the grey "(below 30% HP)" annotation; two items with the same mod merge into one line whose hover lists both items.

- [ ] **Step 4: Commit**

```bash
git add src/ui/in-game/dialogs/character-dialog.tsx
git commit -m "character: Effects section aggregates live gear mods"
```

---

### Task 8: Verification + docs

- [ ] **Step 1: Full gates.** eoweb: `npx tsc --noEmit && npx biome check --write src/ && npm run build`. REOSERV: `cargo fmt -- src/effects/condition.rs src/deep/*.rs src/character/instances.rs` (scope fmt to touched files — repo has pre-existing fmt drift elsewhere; if it reformats untouched files, `git checkout --` them), `cargo clippy`, `cargo test --bin reoserv`.

- [ ] **Step 2: Manual end-to-end** (server + client):
  1. `$gi` items until you hold: a weapon with a baked stat mod + a percent damage mod + a conditional mod; armor with an elemental resist; a classic (non-instance) equip in one slot.
  2. Stats tab: every row's tooltip Base + source lines reconcile with the displayed total (damage row on both ends). Classic equip appears as an uncolored source with no level tag.
  3. A live flat mod (e.g. accuracy_bonus) appears under Effects, NOT in the Accuracy row's gear sum.
  4. Resist armor renders "+N% <Element> resistance" tinted; conditional mod shows the grey annotation; two same-mod items merge with both visible on hover.
  5. Equip/unequip with the dialog open — rows and Effects update live.
  6. Chest, trade, and ground instance tooltips still render (wire change regression check).

- [ ] **Step 3: Docs.**
  - Vault `Web Client/Documentation/Planning/Stats panel effective view.md` — flip Status to shipped, note anything that changed during implementation.
  - Vault `General/Documentation/Planning/Next session.md` — check off the stats-panel punchlist item.
  - Vault `General/Documentation/Gotchas/Eoweb.md` — the "Adding a new InstanceListEntry field requires editing 4 packet readers" entry: update it to note the per-mod block now has a shared codec on BOTH sides (server `write_instance_mod`/`read_instance_mod`, client `readMod`), so per-mod changes are one edit per side; the four-way lockstep now applies only to entry-level (non-mod) fields.
  - Spec file: add "Status: shipped YYYY-MM-DD" line.

- [ ] **Step 4: Commit docs** (eoweb repo)

```bash
git add docs/
git commit -m "docs: stats panel effective view shipped"
```
