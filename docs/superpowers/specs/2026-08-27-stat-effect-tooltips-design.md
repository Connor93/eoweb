# Stat Effect Tooltips — Design Spec

**Date:** 2026-08-27
**Status:** Design approved 2026-08-27. Not yet implemented.
**Surfaces:** REOSERV (new computation + one new deep packet), eoweb (handler, data layer, tooltip, locale)
**Vault:** `Web Client/Documentation/Planning/Stat effect tooltips.md` mirrors the intent; this file is the implementation-facing spec.
**Sibling:** `2026-06-10-stats-panel-effective-view-design.md` — that feature answered *where a stat comes from*; this one answers *what it does*. They share one tooltip.

## Goal

The Stats tab tells a player their STR is 42 and their Armor is 33, and (since the effective-view work) which items contributed. It never tells them what either number *does*. Players cannot answer "should I put this point in STR or AGI?" without reading `config/Formulas.ron`.

Add, to every row of the Stats tab:

1. A one-line plain-English description of what the stat governs.
2. A live, server-computed readout of what that stat is doing **for this character, on this class, right now**:
   - **Six base attributes** — marginal effect: "+1 STR would give you: Damage +0.7, Accuracy +0.1, Armor +0.1, Max HP +2, Max weight +1".
   - **Derived rows** — self-anchored thresholds: "Attacks under 66 are reduced; a 33-damage hit lands for 8", "An attacker needs 64 accuracy to hit you 90% of the time".

Decisions locked during brainstorm (2026-08-27): description **and** live numbers (not either alone); base **and** derived rows (not base only); self-anchored derived numbers (not prose-only, not marginal deltas against an assumed attacker).

## Why the numbers come from the server

Every stat→effect relationship lives in `config/Formulas.ron`, is **per-class** (indexed by `class.stat_group`), and is **hot-reloaded** through `ArcSwap` (`src/main.rs:123`, watcher at `src/main.rs:627`). The same attribute means different things per class — Melee STR is `0.72 * str` damage plus accuracy/evade/armor splashes, Rogue STR is `str / 12.0` damage and nothing else.

Rejected alternatives:

- **Static per-stat prose in eoweb only.** Cannot be class-accurate, and goes silently stale the moment `Formulas.ron` is retuned, with nothing to catch it.
- **Ship the coefficients (or the formula strings) to eoweb and evaluate client-side.** Requires an expression evaluator in the client and duplicates formula semantics across repos — the exact drift the server-authoritative approach exists to prevent. (`format-instance-base-stats.ts` already mirrors the level curves and needs a keep-in-sync comment to survive; do not add more of that.)
- **Client requests on tab open.** Adds a client packet and a round-trip for ~250 bytes when a push funnel already exists.

The server evaluates the live formulas and sends **numbers keyed by string ids**. No English crosses the wire — eoweb's `src/locale.ts` owns every sentence, matching how all other stat labels already work.

## REOSERV — computation

### New module `src/character/stat_effects.rs`

One pure entry point, unit-testable without a live `Player` actor:

```rust
pub struct StatEffectRow {
    pub row: String,               // "str" … "cha", "damage", "accuracy", "evade", "armor", "max_hp", "max_tp"
    pub entries: Vec<(String, f32)>, // (key, value) — key selects the locale template client-side
}

pub fn compute_stat_effects(character: &Character, formulas: &Formulas) -> Vec<StatEffectRow>;
```

### Marginals (the six attributes)

Build the same formula context `calculate_stats` builds (`src/character/calculate_stats.rs:160-175`): `base_str…base_cha`, `str…cha`, `level`. Then, for each attribute, build a perturbed context and take the difference.

**Perturb `base_<stat>` and `<stat>` together, by 1.** Training a stat raises `base_strength`, which cascades into `adj_strength`; bumping only one models something the game cannot do.

**Take the unfloored float difference.** `calculate_stats` applies `.floor()` to every formula result; differencing the floored values would make the marginal flicker between `+0` and `+1` as the underlying fraction crosses an integer. Differencing the raw `f64` yields a stable `+0.72`.

Evaluate per attribute:

| Formula | Source | Emitted key |
|---|---|---|
| `classes[stat_group].damage` | per-class | `damage` |
| `classes[stat_group].accuracy` | per-class | `accuracy` |
| `classes[stat_group].evade` | per-class | `evade` |
| `classes[stat_group].defense` | per-class | `armor` |
| `hp` | global | `max_hp` |
| `tp` | global | `max_tp` |
| `max_weight` | global | `max_weight` |

Clamp `stat_group` into range exactly as `calculate_stats.rs:216` does — a mis-authored class pub must not panic here either.

**Drop entries whose marginal rounds to zero at display precision** (|Δ| < 0.05). This is what makes the CHA case honest: no formula references `cha`, so its entry list comes back empty and the client renders "Has no effect for your class." The same falls out naturally for Rogue WIS. It self-corrects the moment either gets a formula.

### Self-anchored readouts (derived rows)

Probe the live formulas **numerically**. Never parse or pattern-match the formula strings — they are user-editable config.

Combat evaluates `hit_rate` and `damage` with this exact context (`src/character.rs:422-428`): `critical`, `damage`, `target_armor`, `target_sitting`, `accuracy`, `target_evade`.

**Anchor on `effective_stats()`, not the panel totals.** The Stats tab rows show `self.armor` / `self.evasion` / `self.accuracy` from `calculate_stats` (base + gear + *baked* mods). Combat reads `effective_stats()`, which additionally applies **live** mods (`armor`, `evasion`, `accuracy` targets). Anchoring the readout anywhere else would print a number combat does not use.

Because these can differ, each derived row also emits `effective` when the effective value differs from the panel row, and the client renders an "Effective in combat: 40" line. This closes the confusion the mismatch would otherwise create, and is useful on its own.

| Row | Keys | Derivation |
|---|---|---|
| `armor` | `armor_full_damage_at` | Binary-search the smallest incoming `damage` whose formula output equals its input (i.e. unreduced), with `target_armor` = effective armor. |
| `armor` | `armor_example_in`, `armor_example_out` | Worked example: evaluate `damage` at incoming = effective armor. |
| `evade` | `evade_attacker_accuracy_for_90` | Binary-search `accuracy` such that `hit_rate` = 0.90, with `target_evade` = effective evade, `target_sitting` = false. |
| `accuracy` | `accuracy_target_evade_for_90` | Inverse: binary-search `target_evade` such that `hit_rate` = 0.90, with `accuracy` = effective accuracy. |
| `damage` | *(none)* | Prose only — "before the target's armor". No number adds information. |
| `max_hp`, `max_tp` | *(none)* | Prose only. |

**Probe context.** Every probe builds the full combat context, not a partial one: `critical = false` (the shipped `damage` formula multiplies by 1.5 on a crit, which would break the "output equals input" test), `target_sitting = false` (a sitting target is an unconditional auto-hit, so `hit_rate` would return 1.0 and every accuracy search would degenerate), and neutral values for the keys a given formula does not read.

**The `max(1, …)` trap in the armor search.** The shipped `damage` formula floors its output at 1, so the naive predicate "output(d) == d ⇒ unreduced" is **also true at d = 1** (a 1-damage hit against 33 armor computes to 0.0002 and floors up to 1). The predicate is therefore *not* monotone across the whole range and a plain binary search over `[1, hi]` can converge on the wrong boundary.

Search instead over `[2, hi]` for the largest `d` satisfying `output(d) < d`; the threshold is `d + 1`. Then **verify** the result before emitting it: `output(t) == t` and `output(t-1) < t-1`. If verification fails, omit the key.

**Search safety.** All searches are bounded and iteration-capped (~40). Bounds: the armor search takes `hi = 8 × effective_armor + 64`; the two `hit_rate` searches take `hi = 8 × anchor + 1000`, both wide enough to bracket the shipped formulas with headroom for retuning. `hit_rate` is a monotonic sigmoid and `damage` is monotonic in incoming damage under the shipped formulas, but both are hand-editable — so every search is followed by the same verification discipline: re-evaluate at the answer and confirm it satisfies the property that was searched for, within tolerance. If a search fails to converge, brackets no solution, or fails verification, **omit that key** — the client renders one fewer line. A missing readout is acceptable; a wrong one is not.

**Encoding.** `value_x100 = (value * 100).round()`, sign carried separately per the wire layout below.

### Testing

Inline `#[cfg(test)]` in the new module, run with `cargo test --bin reoserv` (the crate has no lib target):

- Melee STR marginal matches the hand-computed `0.72` damage / `1/7` accuracy from the shipped `Formulas.ron`.
- Rogue STR emits a damage entry but **no** evade/armor entries (proves the per-class path and the zero-drop).
- CHA emits an empty entry list on every class (the honesty case).
- Marginal is unfloored: a context where the floored formula output is unchanged by +1 still reports a non-zero marginal.
- Binary searches: `evade_attacker_accuracy_for_90` round-trips through `hit_rate` back to 0.90 ± tolerance.
- Non-convergent formula (a constant `hit_rate`) omits the key rather than emitting garbage.
- The `max(1, …)` trap: with the shipped `damage` formula the armor threshold resolves to `2 × armor` and **not** to 1.

## REOSERV — wire

### New deep packet, family 64

```rust
pub const FAMILY_STAT_EFFECTS: u8 = 64;   // src/deep/mod.rs, after FAMILY_STATUS = 63
```

New `src/deep/stat_effects_server_packet.rs`, modeled on `player_rates_server_packet.rs`. **Self-only** (unlike rates, which broadcast to nearby players).

Wire layout — deliberately generic, so a future readout is a new key rather than a wire change:

```
short  row_count
  char   row_name_len,  bytes row_name
  char   entry_count
    char  key_len, bytes key
    char  sign            (0 = +, 1 = −)
    int   value_x100      (absolute)
```

**The sign byte is mandatory.** eolib ints cannot encode negatives — `encode_number` wraps them into ~2.1 billion. This is the bug that silently corrupted every resist mod in eoweb tooltips until the effective-view work caught it. Reuse the convention (and the `truncated()` 253-byte clamp) from `src/deep/instance_mod_codec.rs`.

Round-trip tests in the packet module, matching the existing codec-test pattern: positive values, negative values, empty list, and a row whose entry list is empty.

### Push point

New `src/map/map/character/sync_stat_effects.rs` exposing `sync_stat_effects(player_id)`, **called from inside `sync_player_rates`** (`src/map/map/character/sync_player_rates.rs`).

`sync_player_rates` is already documented as the "call after any `calculate_stats()`-affecting change" funnel and is already wired into all 13 sites — login/`enter`, `equip`, `unequip`, `equip_instance`, `level_stat`, `reset_stats`, `set_class`, `use_item`, `attack_npc_replies` (exp gain). Hanging the new push there means **one call-site edit rather than thirteen**, and it cannot drift out of sync with the rates push.

Keep the two functions in separate modules; `sync_player_rates` just calls the sibling at its end.

Payload size is ~250 bytes and these are discrete events (not per-tick), so no throttling is needed.

### Explicitly out of scope

Hot-reloading `Formulas.ron` does **not** re-push to connected players; an open tooltip keeps its numbers until that character's next `calculate_stats()` (any equip, level, or trained point). Folding in a re-push on formulas reload — following the `World::ReloadPubs` broadcast precedent — is a separate small piece of work, deferred by decision, not oversight.

## eoweb

### Handler and state

- `src/handlers/stat-effects.ts` — new, parses family 64 into `Map<string, Array<{ key: string; value: number }>>`. Registered in `src/handlers/index.ts` alongside `registerRatesHandlers`.
- Stored on the client (`src/client/client.ts`) next to `playerRates`, with a change-notification subscription so the open dialog re-renders — mirroring the `instanceRev`/`equipRev` pattern already in `character-dialog.tsx`. **The effective-view work shipped a bug where classic equip changes did not invalidate the breakdown memo; do not repeat it** — subscribe to the stat-effects change signal explicitly.

### Data layer — `src/utils/stat-effects.ts` (new, pure)

`buildStatEffectLines(row, entries, locale): string[]` maps `(key, value)` pairs to rendered lines via locale templates.

- **Unknown keys are skipped**, so an older client tolerates a newer server.
- An empty entry list for a base attribute renders the single "Has no effect for your class" line.
- Marginals sort by descending |value| so the stat's dominant effect reads first.
- Value formatting matches the existing convention in `stat-breakdown.ts` / `breakdown-tooltip.tsx`: ≤1 decimal, `+`/`−` sign, no decimal when it would render `.0`.

### Tooltip

Extend the existing `BreakdownTooltip` (`src/ui/components/breakdown-tooltip.tsx`) rather than adding a second hover target — one hover shows the whole story, in order:

```
Strength                       ← row title
Raises your damage, and a      ← description (locale, static)
little accuracy and armor.
                               ← separator
+1 STR would give you:         ← live marginals (server)
  Damage        +0.7
  Accuracy      +0.1
  Max HP        +2
                               ← separator
Base (class & level)    38     ← existing gear breakdown, unchanged
Lv7 Mystic Hat          +4
```

Existing props stay optional so non-stat callers (the effects-line tooltips) are unaffected. Must keep rendering through `PortalTooltip` — DOM tooltips inside `DialogBase` clip on its overflow; this was already fixed once (2026-06-13) and the portal must not be bypassed.

The derived-row variant substitutes the self-anchored sentences for the marginal list, plus the "Effective in combat" line when present.

### Locale — `src/locale.ts`

Extend the existing `stats` block: one `desc*` string per row (12), one template per readout key, plus `noEffectForClass` and `effectiveInCombat`. Templates use the existing `{placeholder}` convention (see `statPoints: 'Stat Points: {count}'`).

### Testing

`npm run typecheck` (**not** `npx tsc --noEmit` — it exits 0 while checking nothing in this repo), `npm run lint` (biome), `npm run build`. Then a manual browser pass: hover all 12 rows on a Warrior, confirm CHA reads "no effect", equip a stat item and confirm the numbers refresh without reopening the dialog, and confirm the tooltip does not clip at the dialog edge.

## Build sequence

1. REOSERV `stat_effects.rs` computation + inline tests (no wire yet).
2. REOSERV deep packet + codec round-trip tests.
3. REOSERV `sync_stat_effects` wired into `sync_player_rates`.
4. eoweb handler + client state + change subscription.
5. eoweb `stat-effects.ts` data layer + locale strings.
6. eoweb tooltip integration.
7. Cross-repo review, then manual browser pass.

Steps 1–3 ship a server that sends a packet nothing reads yet — harmless, and it lets the wire be verified with the packet log before any UI exists.
