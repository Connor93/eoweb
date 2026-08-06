# VFX Set Pieces — Descents and Ground Effects — Design

**Date:** 2026-08-06
**Repos:** eoweb (canonical engine + Pixi renderer) + aio-editor (vendored engine + preview)
**Status:** design approved by user 2026-08-06
**Follows:** [EO-idiom rework](./2026-08-06-eo-idiom-vfx-rework-design.md) · [Expanded VFX engine](./2026-08-05-expanded-vfx-engine-design.md)

## Problem

The 379 generated effects are all **centred, symmetric, abstract shapes** — a ring expands, a nova flashes, a spiral turns. Even now that they're pixel-scaled, ramp-coloured, looped and depth-layered, they are decorations on a tile. They cannot express a **staged set piece**: something that arrives from off-screen, impacts, and leaves residue.

That is the shape of the effects the user actually wants most — "lightning strikes, rings of fire, smites from above, rocks falling" — and it is structurally unreachable today, no matter how good the pixel treatment gets, because every effect is drawn into one square frame centred on the target.

## Roster

Four set pieces × 7 element tints = **28 new names**. Each is a distinct *shape*, tinted per element, exactly as the existing kind × element model works:

| set piece | shape | frame | cadence |
|---|---|---|---|
| `bolt` | lightning strike — forked, descends and cracks | tall | 4 × 1 (400ms) |
| `smite` | beam/pillar from above into a ground flash | tall | 4 × 1 (400ms) |
| `rockfall` | several objects descending, staggered, impacting | tall | 4 × 1 (400ms) |
| `ring-of-fire` | sustained encircling ground band | square | 4 × 3 (1200ms) |

Element tints reinterpret rather than merely recolour: `rockfall-fire` reads as flaming meteors, `smite-dark` as EO's dark beam, `bolt-earth` as a green-tinted strike. That is the same latitude the existing palette already has.

## The timing constraint that shaped this

**Skills have no cast time.** `SkillDef` (`reoserv/src/utils/load_skill_file.rs`) carries cost, cooldown, range, target, kind, `cast_vfx`, `impact_vfx` — and no windup. Damage and `impact_vfx` resolve in the same instant.

So a leisurely descent would land its impact **over a second after** the damage number has popped and the HP bar has moved. That reads as broken, not dramatic — and it is the one problem descents have that centred effects never did.

**Decision: descents are fast — 4 frames × 100ms, one loop.** The object arrives within a few frames of the damage. This is also roughly EO's own pacing (its descents were 6–7 frames, one loop).

**Explicitly out of scope:** adding a real cast time to `SkillDef`. It is the honest long-term fix and would improve casting feel generally, but it is a reoserv + wire change — this project stays client-only. It should get its own spec if wanted.

## Architecture

### A fourth registry layer

Set pieces join matrix / combos / specials as a fourth generation layer: **element-parameterised, size-less** (`hasElement: true, hasSize: false`), exactly like combos.

They are added to the `ShapeKind` union so `VfxDef.kind` types them and they live in the same `KINDS` table as the existing 15 — their draw functions are ordinary draw functions. **But the matrix loop must stop iterating `Object.keys(KINDS)`** and iterate an explicit `MATRIX_KINDS` list instead, or set pieces would silently gain 21 matrix names each.

Naming: `<setpiece>-<element>` — `bolt-fire`, `rockfall-earth`, `smite-light`, `ring-of-fire-water`.

### Staging is authoring, not a mechanism

"Approach → impact → dissipate" is `if (progress < 0.5) { … } else { … }` inside a draw function. All 15 existing kinds are already hand-written draw functions; adding a stage *interpreter* would be a second way to express what the first way already handles. **No stage data structure.** YAGNI.

Likewise no new cadence mechanism: `frames`, `loops` and `frameMs` are already per-def.

### Per-def frame geometry

`FRAME_SIZE` stops being one global square and becomes per-def width/height, defaulting to the current 132 × 132 so every existing effect is untouched.

Descents use:

```
design   128 × 256    (draw-function coordinate space)
internal  44 ×  88    (raster; 256 × 44/128 = 88 exactly)
output   132 × 264    (44×3, 88×3 — integer on BOTH axes)
```

**The integer-scale rule now applies per axis.** A fractional ratio on either produces unevenly-sized pixels; the existing assertion must be extended to cover height.

`ring-of-fire` stays square — it is a ground effect and needs no vertical runway.

**Draw functions are handed the GROUND POINT, not the frame centre.** `renderFrameCanvas`
today passes `(DESIGN_SIZE/2, DESIGN_SIZE/2)` as `(cx, cy)`. For a tall frame that would put
the effect's origin halfway up the headroom. It must pass `(designW/2, groundY)` where
`groundY` is the same three-quarters point the anchor encodes — `y = 192` in a 128 × 256
design frame, `y = 64` in the unchanged 128 × 128 one. Every existing kind keeps receiving
exactly what it receives today; only tall frames differ.

**Extent budgets are per-axis and per-frame.** The horizontal budget is unchanged (≤ 62px
from centre at `sizeScale` 1.5, since width stays 128 in design space). The vertical budget
for a 128 × 256 frame is **≤ 126px above and ≤ 62px below** the ground point — the headroom
is all upward, so a descent may travel far above the target but must not paint below the
existing floor. Measure both axes independently; the existing single-number Chebyshev check
is no longer sufficient for tall frames.

### Per-def anchor

A tall frame extends **upward**: its bottom 132px occupies exactly where a square effect would sit, and the extra 132px is headroom for the descent. So the ground point sits three-quarters down.

- descents: `anchor.set(0.5, 0.75)`
- everything else: `anchor.set(0.5, 0.5)` (unchanged)

eoweb's `SkillBurst` is already shape-agnostic — it reads whatever texture size it is given. **The anchor is the only renderer change.**

### Depth layers

All four author **three** layers. This is the point of a descent: a boulder passes *behind* the character's head and lands *in front* of their feet. A set piece that only used `front` would be a decal again.

### The editor preview is where the work lands

`VfxPreview` currently hardcodes `FRAME_SIZE` for its canvas dimensions, its `clearRect` calls, its scratch tile, and the character stand-in's position. All of those become per-def. The stand-in must stay planted at the *ground point* (three-quarters down for a tall frame), not the canvas centre, or the depth split will read wrongly for exactly the effects this project exists to add.

## What stays untouched

- **No server, wire, or pub-format change.** Set pieces are ordinary `impact_vfx` strings. **Do not touch reoserv.**
- **No editor UI change.** They appear in the existing Shape dropdown automatically, Element enabled and Size greyed — the same treatment combos already get.
- All **379 existing names** keep working, unchanged, at 132 × 132.
- The two curated sprite sheets bypass the procedural pipeline entirely, as always.
- `buildIndex` / `buildShapes` / `composeVfxName` keep their signatures; the round-trip property must still hold for every name including the 28 new ones.

## Testing

Both repos gate on `tsc`; eoweb adds `biome`; neither has a unit-test runner, so engine assertions ride `scripts/vfx-registry-check.ts`.

- Registry grows to **407 names** (379 + 28) and **35 shapes** (31 + 4). Round-trip `compose(decompose(name)) === name` must hold for every one.
- **Set pieces must NOT appear in the matrix**: assert no name of the form `<setpiece>-<element>-sm|lg` exists, and that `buildShapes()` reports `hasSize: false` for all four.
- **Integer scaling on both axes**: `outputW === internalW × PIXEL_SCALE` and `outputH === internalH × PIXEL_SCALE`, for every def.
- Every set piece exposes all three layer draw functions.
- Extent must be measured **per axis** against the def's own frame: horizontal ≤ 62px from centre; vertical ≤ 126px above and ≤ 62px below the ground point for a 128 × 256 frame, ≤ 62px both ways for a square one. The current single-number Chebyshev check cannot express this and must be split.
- **Name uniqueness across all four layers.** `ring-of-fire-water` is a dashed set-piece name sitting alongside dashed kind names (`spark-burst-fire`) and combos (`disc-spark-burst-fire`). Nothing parses names — the index is built at generation — so a collision would be a duplicate key, which the existing uniqueness assertion already catches. Confirm it still does with the new layer present.
- Determinism unchanged: no `Math.random()`; same `(def, frameIndex)` → identical pixels.
- Cross-repo parity (`pnpm vfx:parity`) passes after re-sync.
- **Manual (browser + game, human):** each of the four cast in-game at several elements; the descent arrives within a few frames of the damage number; the object passes behind the character's head and lands in front of their feet; `ring-of-fire` sustains and repeats; the editor preview matches the game including the taller frame; no existing effect changed.

## Risks

- **Four frames is little runway for a descent.** A boulder gets four positions to fall through and may read as a jump-cut. Mitigation authored in from the start: a motion streak on the descending object so each frame implies travel. If it still reads badly, the options are more frames (worsening the damage-sync problem) or a real cast time (out of scope).
- **The tint ruling is still open.** The EO-idiom rework's manual pass has an unresolved blocking question — whether the quantised `tint` layer reads as an intentional flash or an ugly blob on the character. Set pieces author tint layers too, so **whatever is decided there applies here**. If tint is dropped or exempted from quantisation, these four must follow.
- **Texture cost doubles for descents** (132 × 264 vs 132 × 132). Built lazily, so only effects actually cast pay it.
- **`FRAME_SIZE` becoming per-def touches every consumer that assumed one global square** — both render paths, the editor canvas, the stand-in, and the extent assertions. This is the largest mechanical surface in the project and the most likely source of a missed site.

## Scope / YAGNI

**In:** the fourth registry layer; per-def frame geometry and anchor; the four set pieces with three layers each; editor preview support for non-square frames; the extended assertions.

**Out:** a stage/composition interpreter (a draw function already expresses staging); caster-to-target projectile travel (everything here is target-local); a cast time on `SkillDef`; per-kind layer authoring for the other 13 abstract kinds (that remains Phase 3); any new element, size, or cadence mechanism; sound.
