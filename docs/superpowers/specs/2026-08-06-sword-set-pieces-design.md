# Sword Set Pieces — `cleave` and `swordfall` — Design

**Date:** 2026-08-06
**Repos:** eoweb (canonical engine + Pixi renderer) + aio-editor (vendored engine + preview)
**Status:** design approved by user 2026-08-06
**Follows:** [VFX set-piece tweaks](./2026-08-06-vfx-set-piece-tweaks-design.md) · [VFX set pieces](./2026-08-06-vfx-set-pieces-design.md) · [EO-idiom rework](./2026-08-06-eo-idiom-vfx-rework-design.md)

## Problem

There is no sword effect. The catalog's 449 names cover elemental bursts, rings, descents and rockfalls, but a melee weapon skill has nothing to draw — and melee skills are the ones being authored next.

The nearest existing thing is the matrix kind `slash`: a single tapered arc stroked over 24 segments, fading as it sweeps (`kinds.ts` `drawSlash`). It reads as a thin swipe mark with no weight behind it. It is a fine generic accent and is not being changed, but it is not a sword.

## What ships

Two new set pieces, joining `bolt` / `smite` / `rockfall` / `ring-of-fire` in the fourth registry layer — element-parameterised, size-less, with the cycles axis.

### `cleave` — the diagonal slash

`SQUARE_FRAME` (128×128 design, 44×44 raster, `bodyLift: true`), so it sits on the body like the effects it will accompany.

Deliberately **not** a literal blade. At 44×44 internal quantised to four rungs, a sword mid-swing resolves to a bright stick; a crescent does not. So: a heavy leading edge sweeping top-left → bottom-right, a tapered trail falling behind it, and a spark flash at maximum extension. The weight comes from the leading edge being several rungs hotter and several px thicker than the tail — the thing `drawSlash` lacks.

### `swordfall` — the sky sword

`TALL_FRAME` (128×256 design, 44×88 raster, ground point y=192, `anchorY` 0.75, `bodyLift: false`), the same descent path `smite` uses.

Here the blade **is** literal. 44×88 has the vertical room for a readable silhouette: blade, crossguard, hilt. It descends point-down, plants into the ground, and throws an impact ring plus a brief upward dust wedge.

### Naming

`slash` is already a matrix kind, so the slash piece cannot take that name — hence `cleave`, which is unambiguous in the Shape dropdown and does not invite confusion with the accent it sits beside. `swordfall` matches `rockfall`'s style.

### Counts

2 shapes × 7 elements × 3 cycle values = **+42 names → 491 total**. Shapes **35 → 37**.

## The one new capability: `cycleMode`

Cycles are currently implemented as **repeats**. `SkillBurst.step` wraps the absolute step index by the layer's own frame count, so a 4-frame `loops: 3` def visibly plays four frames three times. Every existing cycle-bearing effect wants exactly that.

A flurry cannot work that way: cycle 2 must *differ* from cycle 1. So `cleave` expands the **frame count** instead of the loop count — `frames: 4 × n, loops: 1`.

`SetPieceConfig` gains:

```ts
/** How the `cycles` axis is applied.
 *  'loop'   — multiply `loops`; the same rasterised cycle repeats (bolt,
 *             smite, rockfall, swordfall). No extra textures.
 *  'frames' — multiply `frames`, keeping `loops: 1`, so every cycle is
 *             rasterised separately and can differ (cleave's flurry). */
cycleMode: 'loop' | 'frames';
```

`CYCLES`'s tuple element is currently named `loops`; under `cycleMode` it is a multiplier applied to one field or the other, so it is renamed `count`. Its `CycleKey` type is unchanged.

**This needs no new engine mechanism.** `effectDurationMs` is `frames × loops × frameMs`, so 12×1 and 4×3 are both 1200ms — timing is untouched. `frameProgress` then hands the draw function a progress running 0→1 across the *whole* flurry, which `drawCleave` partitions into `n` segments internally, exactly as `ring-of-fire` partitions on `progress < 0.5`. Staging stays what it has always been: arithmetic inside a draw function, not a framework feature.

**Cost:** at `-x3`, 12 frames × 3 layers ≈ 2.5MB of texture for that one name. Effects are lazily built and cached per name, so only names actually cast are paid for. `'loop'` shapes are unaffected.

## Layer assignment

Three depth layers, same sandwich as every other set piece (`behind` under the target, `tint` additive onto it, `front` over it):

| | `behind` | `tint` | `front` |
|---|---|---|---|
| `cleave` | the trailing wash, so the tail passes *behind* the target | additive bloom along the arc | leading edge + spark flash |
| `swordfall` | ground dust wedge + the impact ring's rear arc | bloom along the blade | the blade, and the impact flash |

An empty `behind` frame is correct and expected on the final frames of `swordfall` once the blade has planted and the dust has settled — the same conclusion `rockfall`'s third landing reached. It is not a stutter, and must be documented at the site so it is not "fixed" back.

## What stays untouched

No server, no wire, no pub-format change — cycle counts ride the effect-name string exactly as sizes and cycles already do. **Do not touch reoserv.** All 449 existing names keep working, `drawSlash` is unchanged, and no existing effect's on-screen position, timing or texture cost moves.

The editor needs **no new controls**: it renders per-shape axis flags already, and both new shapes expose element + cycles, which `VfxField` handles today.

## Architecture

**`vfx-engine/registry.ts`** — `SetPieceName` gains `cleave` and `swordfall`; `SET_PIECES` gains both entries (`cleave`: `SQUARE_FRAME`, `frames: 4`, `loops: 1`, `frameMs: 100`, `hasCycles: true`, `cycleMode: 'frames'`; `swordfall`: `TALL_FRAME`, `frames: 4`, `loops: 1`, `frameMs: 100`, `hasCycles: true`, `cycleMode: 'loop'`). `SetPieceConfig` gains `cycleMode`; the generation loop applies the cycle count to `frames` or `loops` accordingly.

**`vfx-engine/types.ts`** — `ShapeKind` gains `'cleave'` and `'swordfall'` (19 → 21 kinds).

**`vfx-engine/kinds.ts`** — `drawCleave` and `drawSwordfall`, dispatched from the existing `switch`. Both receive the **ground point** as `(cx, cy)`, not the frame centre, per the set-pieces convention.

**eoweb / aio-editor:** nothing beyond the vendored re-sync. No renderer, controller or editor change.

## Testing

Both repos gate on `tsc`; eoweb adds `biome`; assertions ride `scripts/vfx-registry-check.ts`.

- **491 names / 37 shapes**, all unique, round-trip `compose(decompose(name)) === name` for every one.
- **No size leak** on the two new set pieces (`cleave-fire-lg` must not exist), and `hasCycles` true for both.
- **`cycleMode` invariant**, asserted over shapes with `hasCycles: true` only: every `'frames'` shape's generated defs have `loops: 1` and `frames === 4 × cycles`; every `'loop'` shape's have `frames: 4` and `loops === cycles`. This is the guard against the two modes being wired to the wrong field — the failure would be silent, since both produce the same total duration.

  The `hasCycles: true` restriction is load-bearing: `ring-of-fire` declares `loops: 3` with no cycles axis, so an unrestricted `loops === cycles` assertion would fail on it. It still declares `cycleMode: 'loop'` for uniformity; the field is simply inert for shapes with no axis, exactly as `size` is inert for set pieces.
- **Duration parity:** `effectDurationMs` for `cleave-<el>-x3` equals that of `smite-<el>-x3` (1200ms), proving the mode swap did not change pacing.
- Every `SQUARE_FRAME` def still has `bodyLift: true`, `TALL_FRAME` / `GROUND_FRAME` false — `cleave` is the first new `SQUARE_FRAME` effect since that flag was introduced, so this existing assertion now genuinely covers new ground.
- **Extent:** `swordfall` must fit the ~190 design-px of headroom above the tall frame's ground point (`smite` already uses 186 of it). Measure, do not assume.
- Determinism unchanged; per-axis integer scaling unchanged; cross-repo parity passes after re-sync.
- **Manual (browser + game):** both read as intended at every element; `cleave-<el>-x2` forms a visible X rather than a stutter; `swordfall`'s blade reads as a sword and its impact lands with the damage number; no existing effect moved.

## Risks

- **The literal blade may still read as a bright stick.** This is the judgement call only the editor preview can settle, and it is the reason `cleave` deliberately does not attempt one. If `swordfall`'s blade fails to read, the fallback is a descending wedge of force rather than more blade detail — detail is what the 4-rung quantiser destroys.
- **Per-cycle angle derivation must not go through `indexFrac`.** Ring-of-fire's tongues collapsed into a 16.2° band because `indexFrac(i*5+1)` aliased against `indexFrac`'s own 2.399 constant while *looking* independent in source. The flurry's angles come from the cycle index directly.
- **`cycleMode` is easy to wire to the wrong field** — and because both modes yield the same duration, a mix-up shows only as a subtly wrong animation. The registry assertions above are what catch it, not the type checker.
- **Texture cost is now shape-dependent.** `'frames'` mode triples texture use at `-x3`. Acceptable for one shape; it should not become the default without a reason.

## Scope / YAGNI

**In:** `cleave` and `swordfall`; the `cycleMode` distinction; their draw functions and registry entries; the assertions above.

**Out:** changing or retiring the existing `slash` matrix kind; a literal blade in `cleave`; directional/facing-aware slashes (the whole catalog is facing-agnostic); cycles above 3; a `cycleMode` axis on matrix kinds, combos or specials; weapon-graphic-derived blades; sound; any server-side or pub-format change.
