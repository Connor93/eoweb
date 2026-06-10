# Stats Panel Effective View — Design Spec

**Date:** 2026-06-10
**Status:** Shipped 2026-06-10 (pending in-game play-test). Implementation deviations: the per-mod wire block also gained a **sign byte** (eolib ints can't encode negatives — resist mod values were corrupting on the wire pre-existing; fixed in the same lockstep change); the client mirrors the server's skip of **conditional baked-target mods** in gear sums; exactly-cancelling effect lines and pool-deleted (empty-target) mods are skipped in the Effects list.
**Surfaces:** eoweb (primary), REOSERV (one small wire addition)
**Vault:** `Web Client/Documentation/Planning/Stats panel effective view.md` mirrors the intent; this file is the implementation-facing spec.

## Goal

The character dialog's Stats tab shows server-authoritative totals that (since the 2026-06-09 baked-stats change) already include gear-mod contributions — but gives the player no way to see *where the numbers come from* or *what their equipped mods add up to*. This feature adds:

1. **Per-item breakdown tooltips** on every stat row (hover/touch): "Base (class & level): N" plus one rarity-colored line per contributing equipped item.
2. **HP and TP rows** in the derived-stats column (currently missing despite gear mods affecting both).
3. **An "Effects" section** below the stat columns: the character's aggregated live combat mods (damage %, crit, resists, magic find, …) grouped under Offense / Defense / Utility — the only place the player can see their total combat profile.

Decisions locked during brainstorm (2026-06-10): tooltip-per-item presentation (not inline splits), grouped effects layout (not flat/two-column), HP+TP rows added.

## Architecture: client-side computation

Eoweb computes all breakdown data from state it already holds:

- Equipped instances (`instanceController`) carry per-mod `target` (snake_case StatTarget), `kind` (flat / percent_additive / percent_multiplicative), `value`, and `name` on the family-54 wire.
- `levelCurve(level)` in `src/utils/format-instance-base-stats.ts` mirrors the server's `level_curve` (keep-in-sync comment exists).
- EIF records supply base item stats for both instances and classic non-instance equips.

The server's stat totals stay authoritative: the breakdown computes the **gear side**, and `Base = serverTotal − gearTotal`. Any rounding drift lands in the Base line, never in a wrong total.

**One server wire addition (the only REOSERV change):** conditional mods (e.g. `low_hp_damage` → "below 30% HP") can't be annotated client-side because the per-mod wire block carries no `when` data, and eoweb deliberately has no modifiers.json cache. Fix: append a server-rendered condition string to the per-mod block — empty when unconditional. Both sides have a single shared per-mod codec:

- REOSERV: `build_instance_list_mod` (`src/character/instances.rs`) appends the formatted string; new small formatter `condition_display(when: &Condition) -> String` renders each Condition variant ("below 30% HP", "above 80% HP", "vs aggressive", "in <zone>", …).
- eoweb: the shared `readMod` sub-parser (`src/handlers/instance.ts`) reads it into `InstanceMod.condition?: string`.

Per the eoweb gotchas note, the four outer packet parsers share `readMod`, so this is one edit per side — but verify all four packet paths (INSTANCE_LIST, ChestInstanceList, TradeInstanceList, InstanceGroundAdd) still parse after the change, since the entry block length changes on the wire.

## Data layer — `src/utils/stat-breakdown.ts` (new, pure functions)

### `computeGearBreakdown(instances, equipment, getEifRecord): GearBreakdown`

For each of the 12 stat rows (Damage is one row covering min and max):

| Row | Sources |
|---|---|
| STR, INT, WIS, AGI, CON, CHA | per-item: `round(eifStat × levelCurve(level))` + flat mods targeting that stat |
| Max HP, Max TP | same pattern (`item.hp`/`item.tp` + `max_hp_bonus`/`max_tp_bonus` mods) |
| Min/Max Damage, Accuracy, Evade, Armor | per-item **level-scaled base item stats only** — see "baked vs live" below |

Output per stat: `{ gearTotal: number, sources: Array<{ name, rarity, level, amount }> }`.

**Baked vs live — the critical correctness rule.** The server totals shown in this tab include: base stats + class formulas + level-scaled item stats + **baked** mod targets only (STR–CHA, max HP/TP/SP — `StatTarget::is_baked()`). Mods targeting accuracy / evasion / armor / hp_regen etc. are **live** effect-engine mods: they affect combat but are NOT in the panel totals. Therefore:

- Stat-row gear sums include flat **baked-target** mods only. Including a live `accuracy_bonus` mod in the Accuracy row's gear sum would push Base negative (the total doesn't contain it).
- Live mods — including flat ones like `accuracy_bonus` — belong in the **Effects** section instead (e.g. "+5 Accuracy" under Offense).

**Rounding mirror rules** (match server exactly):
- Per-item base stats: `Math.round(v × levelCurve(level))` per item per stat — mirrors `calculate_stats`'s `scale()`.
- Baked mod values: sum raw f32 values per stat across all items, round **once** — mirrors `baked_mods::fold`. Per-item tooltip lines show the raw value with one decimal when fractional (e.g. "+2.4"); the gear total uses the rounded sum.
- Classic non-instance equips: EIF stats at 1.0 scale, attributed by item name with no level tag.

### `computeEffects(instances): EffectGroup[]`

Walks equipped instances' **non-baked** mods. Merge key: `(target, kind, condition)`. Aggregation:

- `flat`: sum values.
- `percent_additive`: sum values; display `+X%` (×100, ≤1 decimal).
- `percent_multiplicative`: combine `(1+a)(1+b)−1`; display the combined percent.
- Conditional mods (non-empty `condition` string) never merge with unconditional ones; the condition renders as a grey suffix.

Each merged line keeps `sources` (per-item name/rarity/amount) for the same hover tooltip.

**Category map** (`target → Offense | Defense | Utility`, unknown targets → Utility):
- **Offense:** damage_dealt, damage_dealt_{fire,water,earth,wind,light,dark}, crit_chance, crit_damage, accuracy, attack_speed, status_duration_dealt, healing_dealt
- **Defense:** damage_taken, damage_taken_{six elements}, evasion, armor, crit_damage_taken, crit_resistance, slow_resistance, poison_resistance, root_resistance, status_duration_self, healing_received
- **Utility:** xp_gain, gold_gain, rep_gain, drop_chance, magic_find, hp_regen, tp_regen, sp_regen, move_speed, mana_cost_reduction, cooldown_reduction

Dormant mods (attack_speed, cooldown_reduction, status mods — rolled but not yet wired server-side) still display; they describe the item honestly and start mattering the moment their systems ship.

**Display labels.** A `target → label` table prettifies snake_case ("damage_dealt" → "Damage dealt"). Two inversions, matching the approved mockup:
- `damage_taken_<element>` with negative value → positive "**<Element> resistance**" (e.g. −0.14 fire → "+14% Fire resistance"), tinted with `combatElementColor`.
- `damage_taken` stays literal (e.g. "−10% Damage taken").
- `damage_dealt_<element>` → "<Element> damage", element-tinted.

## UI — `character-dialog.tsx` + one shared component

- **`BreakdownTooltip`** (new, `src/ui/components/`): hover/touch tooltip listing "Base (class & level): N" + per-source lines (rarity-colored name, "Lv7" tag for instances, green amount). Reuses the EquipSlot tooltip's styling (`bg-base-300`, absolute positioning) and its touch pattern (pointerdown shows, outside-touch clears).
- **`StatsTab` changes:** stat values get a dotted underline affordance + `BreakdownTooltip`; derived column order becomes Damage, Accuracy, Evade, Armor, HP, TP; rows only show tooltips for the **own character** (the tab is own-character-only today anyway).
- **`EffectsSection`** (new, inside character-dialog.tsx unless it outgrows it): "Effects" header; three group sub-headers (omit empty groups); one line per merged effect with hover attribution; "No effects from equipped gear" empty state.
- **Re-render:** existing `usePlayerStats` subscriptions + `instanceController.subscribeChanged` (the EquipSlot pattern) so equipping/unequipping updates the tab live.
- **Locale:** new strings in `locale.ts` for: HP/TP row labels, "Effects", group headers, "Base (class & level)", empty state. All locales get values (English placeholders in non-English locales, matching recent precedent). Server-side condition strings arrive pre-rendered, so no client condition phrasing table.

## Verification

1. `tsc --noEmit` + `npx biome check --write` (lefthook gotcha) in eoweb; `cargo check` + `cargo test --bin reoserv` for the wire addition.
2. In-game with the dev server: equip a known set (e.g. `$gi` a sword with str_bonus + fire_dmg + low_hp_damage, a hat with max_hp_bonus, keep one slot classic):
   - STR/HP tooltips: per-item lines sum to gearTotal; Base + gear == displayed total exactly.
   - Accuracy row gear sum excludes any accuracy_bonus mod; that mod appears under Offense instead.
   - Effects: fire damage line tinted, conditional line shows grey "below 30% HP", merged values correct for two items with the same mod.
   - Unequip → tab updates live; totals still match server packets.
3. Chest/trade/ground tooltips still render mods (wire change touched the shared block).

## Out of scope

- Other players' stats (tab is own-character only).
- Showing computed effective combat numbers (e.g. final crit chance %) — this displays gear aggregates, not combat-resolution math.
- A client test runner. The math is in pure functions so vitest could cover it later; eoweb has no test infra today.
- Server-computed breakdown packet (upgrade path if rounding drift ever becomes a real problem).
