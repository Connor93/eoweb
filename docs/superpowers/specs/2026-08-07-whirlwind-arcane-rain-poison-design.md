# Set Pieces: `whirlwind`, `arcane-rain`, `poison` — Design

**Date:** 2026-08-07
**Repos:** eoweb (canonical engine + Pixi renderer) + aio-editor (vendored engine + preview)
**Status:** design approved by user 2026-08-07
**Follows:** [Sword set pieces](./2026-08-06-sword-set-pieces-design.md) · [VFX set-piece tweaks](./2026-08-06-vfx-set-piece-tweaks-design.md) · [VFX set pieces](./2026-08-06-vfx-set-pieces-design.md)

## Problem

Three effects the catalog can't express: a tornado, a falling magical barrage, and a poison burst.

Two have thin cousins in the matrix, and the gap is instructive. `vortex` is three stroked arms rotating in a square frame; `rain` is twelve streaks confined to the same square. Both are small self-contained squiggles that neither arrive from anywhere nor leave residue — the same limitation that motivated the first set pieces. `poison` has no precedent at all.

## What ships

Three set pieces in the existing fourth registry layer — element-parameterised, size-less.

### `whirlwind`

`TALL_FRAME` (128×256 design, ground point y=192, `anchorY` 0.75, `bodyLift: false`). A funnel narrow at its base and widening upward, debris orbiting it, a scuff ring at its foot.

**Sustained, with no cycles axis** — `frames: 4, loops: 3, frameMs: 100` (1200ms), `hasCycles: false`. Same reasoning as `ring-of-fire`: being sustained is what a tornado *is*, and a one-cycle whirlwind is not a thing anyone wants. **7 names.**

This is the first **tall-frame sustained** effect — every prior `TALL_FRAME` def is a one-shot descent. It needs no new field: `loops: 3, hasCycles: false` on a `TALL_FRAME` is a combination the existing tables already express.

### `arcane-rain`

`TALL_FRAME`, the descent path `smite` and `rockfall` use. Motes fall **staggered rather than in unison** — the eye reads a barrage that way and a curtain otherwise — and pop on contact.

Carries the cycles axis in **`cycleMode: 'loop'`**, so `-x2`/`-x3` read as successive waves and cost no extra textures (a wave is identical to its predecessor, which is exactly what loop mode is for). **21 names.**

### `poison`

`SQUARE_FRAME`, body-centred (`bodyLift: true`) so it sits on the NPC rather than at its feet. A low puff of miasma with bubbles rising and popping.

**Deliberately the smallest of the three:** `frames: 4, loops: 1, frameMs: 100` — 400ms, no cycles. The user intends it to fire on every DoT tick, and their `poison.json` ticks at 1000ms, so it must complete and clear well before the next tick. A longer effect would overlap itself and read as a smear. **7 names.**

Note the shape name `poison` coincides with the *status* id `poison`. Different namespaces, no collision — but worth stating so nobody "fixes" it.

### Counts

+35 names → **526 total**; shapes **37 → 40**; `ShapeKind` **21 → 24**.

## Layers

The usual three-layer sandwich (`behind` under the target, `tint` additively onto it, `front` over it):

| | `behind` | `tint` | `front` |
|---|---|---|---|
| `whirlwind` | far wall of the funnel + ground scuff | additive swirl on the target | near wall + orbiting debris |
| `arcane-rain` | ground splashes where motes land | bloom | the falling motes |
| `poison` | low haze pooling under the body | sickly wash | bubbles and the puff |

`whirlwind`'s split is the load-bearing one: drawing the far wall behind the target and the near wall in front is what makes the funnel read as *enclosing* it rather than as a decal pasted over it.

An empty `behind` frame is correct wherever nothing is behind the character yet — `arcane-rain` has none until the first mote lands. The same conclusion `rockfall` and `swordfall` reached; it is not a stutter and must be documented at the site so it is not "fixed" back.

## What stays untouched

**No engine mechanism changes.** All three fit the existing frame presets and the `cycleMode` distinction added for `cleave`. No server, no wire, no pub-format change — **do not touch reoserv**. All 491 existing names keep working, and no existing effect's position, timing or texture cost moves.

The editor needs **no new controls**: it reads per-shape axis flags already, and all three expose element (plus cycles for `arcane-rain`), which `VfxField` handles today.

Per-tick playback of `poison` is explicitly **out of scope** — it is a separate cross-repo project (`tick_vfx` on `StatusDef`, wire delivery, client lifecycle), agreed to follow this one. Until it lands, `poison` is usable as an ordinary `impact_vfx` that fires once when the status is applied.

## Architecture

**`vfx-engine/types.ts`** — `ShapeKind` gains `'whirlwind'`, `'arcane-rain'`, `'poison'`.

**`vfx-engine/registry.ts`** — `SetPieceName` gains the three; `SET_PIECES` gains:

| name | frame | frames | loops | frameMs | hasCycles | cycleMode |
|---|---|---|---|---|---|---|
| `whirlwind` | `TALL_FRAME` | 4 | 3 | 100 | `false` | `'loop'` |
| `arcane-rain` | `TALL_FRAME` | 4 | 1 | 100 | `true` | `'loop'` |
| `poison` | `SQUARE_FRAME` | 4 | 1 | 100 | `false` | `'loop'` |

(`cycleMode` is inert where `hasCycles` is false; all three declare `'loop'` for uniformity, as `ring-of-fire` does.)

**`vfx-engine/kinds.ts`** — three draw-function sets and their `KINDS` entries, dispatched from the existing table. All receive the frame's **ground point** as `(cx, cy)`, not its centre.

**eoweb / aio-editor:** nothing beyond the vendored re-sync.

## Testing

Both repos gate on `tsc`; eoweb adds `biome`; assertions ride `scripts/vfx-registry-check.ts`.

- **526 names / 40 shapes**, all unique, round-trip `compose(decompose(name)) === name` for every one.
- **Three pre-existing hardcoded lists must be updated, and they take DIFFERENT membership** — this is the trap the last project hit twice:
  - the matrix-leak check (`~line 236`): add all three.
  - the size-leak check (`~line 286`): add all three.
  - the **`hasCycles` expectation** (`~line 264`): add **`setpiece:arcane-rain` only**. `whirlwind` and `poison` have no cycles axis, and listing them would invert the assertion.
- **No cycles leak:** `whirlwind-<el>-x2` and `poison-<el>-x2` must not exist.
- **No size leak:** no `<setpiece>-<el>-sm|lg` for any of the three.
- The `cycleMode` invariant continues to hold (it covers `hasCycles: true` shapes only, so `arcane-rain` must satisfy `frames: 4, loops === cycles`).
- **`poison` duration is 400ms** — asserted directly via `effectDurationMs`, because the whole point of the shape is that it fits inside a 1000ms tick. A later "make it prettier" edit that adds loops would otherwise silently break the thing it exists for.
- **`whirlwind` extent** must fit the ~190 design-px of headroom above the tall frame's ground point. Guarded arithmetically from its geometry constants, as `swordfall`'s is — there is no node-side canvas, and a computed guard cannot drift from the art.
- Every `SQUARE_FRAME` def still has `bodyLift: true`, `TALL_FRAME`/`GROUND_FRAME` false.
- Determinism unchanged; cross-repo parity passes after re-sync.
- **Manual (browser + game):** all three read as intended at every element; `whirlwind`'s funnel visibly encloses the target rather than sitting flat over it; `arcane-rain-<el>-x2` reads as a second wave, not a stutter; `poison` completes well inside one tick; no existing effect moved.

## Risks

- **`whirlwind` is the first sustained tall-frame effect**, so it is the first to hold a 128×256 frame on screen for 1200ms. If the funnel is too opaque it will obscure the target it is centred on for over a second. The `behind`/`front` split is the mitigation; the manual pass must judge it specifically.
- **`arcane-rain`'s staggering must not go through `indexFrac`.** Its 2.399 constant aliased `ring-of-fire`'s ten tongues into a 16.2° band while looking independent in source. Derive mote phases from the index directly.
- **`poison` is the only one with a hard timing contract.** 400ms is not a stylistic choice; it is what keeps per-tick playback from overlapping once project B lands.
- **Three lists, three different memberships.** The last project updated one list, shipped, and had a reviewer find the other two. Getting `hasCycles` wrong is the dangerous one, because the assertion inverts rather than simply failing to cover.

## Scope / YAGNI

**In:** the three shapes, their registry entries and draw functions, and the assertions above.

**Out:** `tick_vfx` / per-tick playback (project B); a cycles axis on `whirlwind` or `poison`; a spin-attack shape (considered and deliberately not built — the user chose the tornado reading); changing or retiring the existing `vortex` and `rain` matrix kinds; area/multi-tile placement (that belongs to the channeled/area-cast work); sound.
