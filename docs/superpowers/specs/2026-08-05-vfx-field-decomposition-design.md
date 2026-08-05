# VFX Field Decomposition — Shape × Element × Size pickers — Design

**Date:** 2026-08-05
**Repos:** eoweb (engine: new structured index) + aio-editor (the field UI)
**Status:** design approved by user 2026-08-05; spec written for execution (→ plan → subagent-driven build)
**Follows:** [Expanded VFX engine](./2026-08-05-expanded-vfx-engine-design.md) (shipped — 379 effects)

## Problem

The expanded VFX engine grew the palette from 3 to **379** effects, and the AIO
editor surfaces all of them through a single flat `<datalist>` of 381 strings on
the `cast_vfx` / `impact_vfx` fields. That is an unusable picker: an author
scrolling `nova-earth-lg`, `nova-fire`, `nova-fire-lg`, `nova-fire-sm`, … cannot
see that there are only ~31 distinct *shapes* underneath, each available in 7
element tints and 3 sizes.

The flat list also **hides the structure's own rules**. Combos exist at base size
only, and specials have no element at all — but nothing in a flat list tells you
that, so an author will hunt for `nova-sparkle-fire-lg` and conclude it's missing.

## Goal

Replace the single free-text-plus-datalist control with **three orthogonal
pickers — Shape, Element, Size** — that compose into the same stored string, with
the existing live preview following the selection. Authors pick a shape from ~34
entries (neutral being the standard presentation), then tint and size it.

## Constraints

- **Client-only, UI-only.** The stored pub value stays the single composite
  string (`nova-fire-lg`). It is the wire contract (family-62 `List`) and the
  engine's registry key. **No reoserv change, no wire change, no pub-schema
  change** — same property the engine work held.
- **Nothing may be silently rewritten.** A value the pickers cannot represent is
  preserved verbatim.
- The `vfx-engine` stays **framework-agnostic** (Canvas2D + plain TS, zero
  Pixi/Preact/`@/` imports) and **canonical in eoweb**, script-synced into
  aio-editor. Any engine change here means re-sync + `pnpm vfx:parity`.

## Context & current state

- **Naming grammar is three layers, not one flat space:**

  | layer | grammar | count | element? | size? |
  |---|---|---|---|---|
  | matrix | `<kind>-<element>[-<size>]` | 315 | yes (7) | yes (3: `sm`/base/`lg`) |
  | combo | `<kindA>-<kindB>-<element>` | 56 | yes (7) | **no** — base only |
  | special | arbitrary (`heal-glow`, `stun-stars`) | 8 | **no** | **no** |
  | sheet | `cast-burst`, `fire-impact` | 2 | **no** | **no** |

  Matrix + combo + special = the 379 in `buildRegistry()`. The 2 sheets live in
  eoweb's `src/render/vfx/vfx-manifest.ts` (`SHEETS`), **not** in the engine.

- **Axes and constants** (`src/vfx-engine/`): 15 `ShapeKind`s in `types.ts`; 7
  `ELEMENTS` in `palette.ts` (`neutral 0xfff8e1, fire 0xfb923c, water 0x60a5fa,
  earth 0x84cc16, wind 0xfacc15, light 0xfde047, dark 0xa855f7`); `SIZES`
  (`sm` 0.6 / `''` 1.0 / `lg` 1.5), `COMBOS` (8 pairs) and `SPECIALS` (8) are
  **module-private** in `registry.ts`.
- **Scope is two fields in one form.** Only `skills.json` declares `cast_vfx` /
  `impact_vfx` (both top-level, `"x-aio-suggest": []`). `statuses.json` has only
  `icon_id`. Verified 2026-08-05.
- **Empty string is a meaningful value.** reoserv defaults both fields to
  `String::new()` (`load_skill_file.rs`), i.e. "no VFX" — the pickers need an
  explicit `None`.
- **Current wiring** (`aio-editor/packages/frontend/src/pubs/form/fields.tsx`):
  `suggestionsForPath` → `VFX_SUGGESTIONS` (381 names) → `SuggestField`, which
  renders `<VfxPreview value={current} />` when `isVfxPath(path)`.

## Architecture

### Decision: the engine emits the structure; the editor never parses names

Kinds contain dashes (`spark-burst`, `beam-pop`, `burst-lines`), so
`disc-spark-burst-fire` is a **combo** while `spark-burst-fire-lg` is a
**matrix** entry. Recovering axes by splitting on `-` is ambiguous-looking and
needs longest-match-against-the-kind-list to be correct at all.

`buildRegistry()` already **knows** every axis at the moment it generates each
name — it just discards them. So the engine will also export that structure,
rather than the editor re-deriving it.

Rejected alternatives:
- **Editor parses names with a regex** — duplicates the grammar in a second
  repo and breaks the first time a dashed kind is added.
- **Editor re-runs the generation loops from exported constants** — a second
  implementation of the same grammar that must stay in lockstep with the first.

The vendoring machinery (sync script + parity check) already exists to
distribute the engine, so putting the grammar there costs nothing extra.

### eoweb — `src/vfx-engine/registry.ts` (+ barrel)

New exports, sharing the existing loops so the index and the registry cannot
disagree:

```ts
export type VfxLayer = 'matrix' | 'combo' | 'special';
export type SizeKey = 'sm' | 'base' | 'lg';

/** The axes that produced one generated name. */
export interface VfxAxes {
  layer: VfxLayer;
  kind: ShapeKind;          // matrix/combo: the base kind. special: its def's kind.
  combo?: ShapeKind;        // combo only
  element?: ElementKey;     // matrix + combo only
  size?: SizeKey;           // matrix only
  shapeId: string;          // the Shape picker's stable key (see below)
}

/** name -> axes, for every key in buildRegistry(). Same 379 keys. */
export function buildIndex(): Record<string, VfxAxes>;

/** One entry per selectable Shape, in display order. */
export interface VfxShape {
  id: string;               // 'kind:nova' | 'combo:nova+sparkle' | 'special:heal-glow'
  label: string;            // 'Nova' | 'Nova + Sparkle' | 'Heal Glow'
  layer: VfxLayer;
  hasElement: boolean;      // matrix + combo
  hasSize: boolean;         // matrix only
}
export function buildShapes(): VfxShape[];

/** axes -> name. Returns null if the combination isn't generated. */
export function composeVfxName(
  shapeId: string,
  element?: ElementKey,
  size?: SizeKey,
): string | null;
```

`SIZES`, `COMBOS` and `SPECIALS` become exported (they are currently private) so
the index can be built from the same data.

**`SizeKey` is not the name suffix.** The registry generates base-size names with
an *empty* suffix (`SIZES` uses `['', 1.0]`, giving `nova-fire`, not
`nova-fire-base`). `SizeKey` uses the explicit `'base'` because `''` is a
terrible value for a UI control and an unusable object key. The mapping
`'sm' → 'sm'`, `'base' → ''`, `'lg' → 'lg'` lives inside `composeVfxName` and
`buildIndex` only — **`'base'` must never reach a generated name.** The
round-trip assertion below is what catches an implementer wiring it straight
through.

`shapeId` is deliberately **not** the effect name — a shape has no name of its
own until an element is chosen, and namespacing (`kind:` / `combo:` / `special:`)
keeps the three layers from colliding in the picker's value space.

### aio-editor — the `VfxField` component

`packages/frontend/src/pubs/form/VfxField.tsx`, replacing the `SuggestField`
route for the two vfx fields (`SuggestField` keeps handling `icon_id` unchanged).

Controls, top to bottom:

1. **Shape** — one `<select>`, ~34 entries in this order:
   - `⚠ Custom: <value>` — **pinned at the very top, and present only when the
     stored value doesn't decompose** (see below). It sits above `None` so the
     current selection is the first thing visible when the field is in that
     state.
   - `None` → `""`
   - 15 kinds — `Ring`, `Disc`, `Spark Burst`, …
   - 8 combos — `Nova + Sparkle`, `Ring + Slash`, …
   - 8 specials — `Heal Glow`, `Buff Aura`, …
   - 2 sheets — `Cast Burst (sheet)`, `Fire Impact (sheet)`
2. **Element** — 7 color chips rendered from the engine's own `ELEMENTS` hex
   values (`#${v.toString(16).padStart(6,'0')}`), selected chip ringed.
   Disabled/greyed when `!shape.hasElement`.
3. **Size** — a 3-way `S / M / L` segmented control. Disabled when
   `!shape.hasSize` — **including for combos**, which are base-size only.
4. **Preview** — the existing `<VfxPreview value={composedName} />`, unchanged.
5. **Raw toggle** — a `›` control swapping the whole thing for today's free-text
   input (and `‹` back). The escape hatch for authoring a name the pickers
   can't express.

### Data flow

**Decompose (render):** `stored string → index lookup → axes → control state`.
`""` → `None`. A hit in `SHEET_NAMES` → that sheet's shape, no axes. A miss in
both → `Custom` mode: the raw string is shown pinned in the Shape select, the
Element/Size controls are disabled, `VfxPreview` shows its existing muted state,
and an inline note reads "not a known effect — kept as-is".

**Compose (on change):** `control state → composeVfxName(...) → onChange(name)`.
`None` emits `""`. Sheets emit their literal name.

**Defaults and memory.** Picking a shape with no current element defaults to
**`neutral`** — the user's "neutrals as the standard". Size defaults to `base`.
The last-used element and size are held in component state (not written to the
pub) so switching Nova → Heal Glow → Nova restores the previous tint and size
rather than resetting to neutral/base.

## What stays untouched

reoserv (server, wire, pub format); the pub JSON schemas; `VfxPreview.tsx`;
`ICON_SUGGESTIONS` and the `icon_id` field; the engine's drawing code, palette
values, registry contents and all 379 names; `SkillVfxController` / `vfx-loader`
/ eoweb rendering generally. `VFX_SUGGESTIONS` stays exported for the raw-mode
datalist.

## Testing

Both repos gate on `tsc`; eoweb adds `biome`; neither has a unit-test runner, so
the engine assertions ride the existing headless `scripts/vfx-registry-check.ts`
(`pnpm vfx:check`).

- **Round-trip property (the load-bearing one):** for **every** key in
  `buildRegistry()`, `composeVfxName(axes.shapeId, axes.element, axes.size)`
  must return that exact name. This covers every dashed-kind and combo edge case
  at once — `spark-burst-fire-lg` and `disc-spark-burst-fire` both have to
  survive it.
- `buildIndex()` and `buildRegistry()` have **identical key sets** (not merely
  equal counts — a rename must fail).
- `buildShapes()`: ids unique; `hasElement` true for matrix+combo only;
  `hasSize` true for matrix only; every shape reachable from some index entry
  and vice versa.
- Every `VfxAxes.element` is a key of `ELEMENTS`; every `kind`/`combo` is a real
  `ShapeKind`.
- `pnpm vfx:parity` still passes after the engine change (sync must be re-run).
- **Manual (browser, human):** open a skill → Shape/Element/Size render and the
  preview follows each change; combos grey out Size; specials grey out both;
  `None` clears to `""`; hand-write a junk value in the JSON view and confirm it
  round-trips through `Custom` untouched; the raw toggle works both ways;
  `icon_id` and the item/NPC forms are unaffected.

## Drift / gotchas

- The engine is **canonical in eoweb** — edit `eoweb/src/vfx-engine/`, then
  `bash scripts/sync-vfx-engine.sh`, then `pnpm vfx:parity`. Never hand-edit
  aio-editor's vendored copy.
- **The 2 sheet names are not in the engine.** They live in eoweb's manifest, so
  the editor carries its own copy of those two strings (as it already does in
  `VFX_SUGGESTIONS`). Adding a third sheet means updating that list by hand.
- Adding a `ShapeKind`, a combo pair, or a special automatically flows into the
  pickers via `buildShapes()` — but only after a re-sync.
- `buildIndex()` / `buildShapes()` allocate per call; memoize at module scope in
  the editor exactly as `buildRegistry()` already is in `VfxPreview.tsx`.
- Element chips must read their colors from the engine's `ELEMENTS`, never a
  hardcoded CSS list — that's how the palette stays single-sourced.

## Scope / YAGNI

**In:** the engine index/shapes/compose API + its assertions; the `VfxField`
component with Shape/Element/Size/preview/raw-toggle; `Custom` preservation;
routing the two vfx fields to it.

**Out:**
- **Auto-deriving the element from the skill's `DealDamage.element`** —
  cross-field coupling the user didn't ask for, and a fire skill may legitimately
  want a white impact. Explicitly rejected, not deferred.
- Element or size axes for specials — they are hand-tuned fixed params by design.
- Size variants for combos — the registry doesn't generate them; the UI reflects
  that rather than papering over it.
- Any new effects, kinds, or palette changes.
- Touching `icon_id`, which keeps its datalist.
- Grouping/`<optgroup>` styling refinements beyond the stated ordering.
