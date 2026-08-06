# EO-Idiom VFX Rework — Phase 1 + Layer Plumbing — Design

**Date:** 2026-08-06
**Repos:** eoweb (canonical engine + Pixi renderer) + aio-editor (vendored engine + preview)
**Status:** design approved by user 2026-08-06 (decisions taken visually, see "Decision record")
**Builds on:** [Expanded VFX engine](./2026-08-05-expanded-vfx-engine-design.md) · [Field decomposition](./2026-08-05-vfx-field-decomposition-design.md)

## Problem

The generated palette works — 379 effects, one authoring surface, full element and
size coverage. But it doesn't look like Endless Online. Our effects are smooth
antialiased Canvas2D arcs and gradients that expand once and fade to nothing,
drawn as a single flat sprite pasted on top of the character. They read as a
modern UI flourish rather than as magic in an isometric pixel-art game.

The user wants the palette reworked into EO's idiom — not EO's assets reused
(provenance) and not a second tier alongside (the current look should go away).

## What actually makes EO effects feel like EO

Measured across all 34 effects in `src/utils/get-effect-metadata.ts`. The feel is
mostly **not** about the art:

| property | EO | ours today |
|---|---|---|
| frames per effect | **4–7** (mode: 4) | 12–14 |
| playback | **short cycle looped 1–8×** | one-shot fade to zero |
| depth | **3 layers** — behind / on / in front of the character | one flat sprite on top |
| descent | 8 effects arrive from above (`offsetY` −160/−114 + vertical slide) | all centred on the target |
| flicker | 3 effects pick a random frame in a range | strictly linear progress |
| colour | small fixed palettes, hard steps | one hex per element, smooth alpha falloff |

Layer usage is not a rare flourish there: 18 of 34 use the behind layer, 18 the
transparent one, 20 the front one.

## Decision record

Each was chosen by the user from live animated side-by-side mockups
(`.superpowers/brainstorm/39322-1785983625/content/`):

| lever | choice | rejected |
|---|---|---|
| pixel scale | **44px internal**, nearest-neighbour upscale | 128 (current), 64 (subtle), 32 (heavy) |
| cadence | **4 frames × 3 loops**, loop count **per-effect** | continuous fade; 4×1; 6×2 |
| depth | **three authored layers** | flat (current); auto-split by geometry |
| colour | **4-shade ramp per element, hard steps** | current smooth alpha; ramp + Bayer dither |
| phasing | global treatment → **layer plumbing + set pieces** → remaining kinds | all-at-once; core-set-only; set-pieces-first |

Dither was rejected partly on a flagged risk: a screen-space dither pattern
shimmers when the shape animates through it.

## Scope of THIS spec

**In — Phase 1 plus the Phase 2 plumbing:**
- the pixel pipeline (44px internal → ramp quantisation → integer nearest-neighbour upscale)
- the ramped palette
- discrete frame cadence with per-effect loops
- the **three-layer API end to end**: engine → eoweb's Pixi renderer → the editor preview
- migrating all 15 existing kinds onto the new pipeline, retuned so they survive it

The plumbing is in scope *now* because `renderFrameCanvas` changing from returning
one canvas to three is a breaking change across both repos. Doing it in the same
pass as the pipeline rework costs far less than doing it twice.

**Out — deliberately deferred, each its own project:**
- **Set pieces** (lightning strike, smite from above, falling rocks, ring of fire) —
  the user's highest-value item, and the immediate next project. Needs an origin
  offset, a non-square frame, and multi-stage timing, none of which exist yet.
  Sketched under "Forward compatibility" so this spec doesn't box it out.
- **Per-kind three-layer authoring** for the remaining abstract kinds (Phase 3).
  This spec establishes the capability and proves it on exemplars; filling in the
  other kinds is incremental follow-up work.
- Sound, new kinds, new elements, any server/wire/pub change.

## Architecture

### 1. Ramped palette (`palette.ts`)

`ELEMENTS` becomes a table of 4-shade ramps — shadow, mid, base, highlight:

```ts
export type Ramp = readonly [shadow: number, mid: number, base: number, hot: number];
export const ELEMENTS: Record<ElementKey, Ramp> = {
  fire: [0x7c2d12, 0xea580c, 0xfb923c, 0xfed7aa],
  // …
};
```

**The `base` rung must remain the current combat-element colour**
(`fire 0xfb923c`, `water 0x60a5fa`, …). That constraint predates this work — the
engine's palette mirrors `src/combat-overlay/element-colors.ts` — and the ramp
extends it rather than replacing it.

Ramps are **authored as a literal table**, not computed at runtime from the base.
Shadow/mid/hot are picked by darkening and lightening the base by eye, because a
mechanical darken/lighten produces muddy shadows on the warm elements and washed
highlights on the cool ones. The table is small (7 × 4) and it is art, not maths.

**`VfxDef.color: number` becomes `VfxDef.ramp: Ramp`** — every consumer that reads
`def.color` changes with it. The eight **specials** (`heal-glow` `0x86efac`,
`crit-flash` `0xffffff`, …) carry hardcoded colours outside the element table and
each needs its own authored ramp; `crit-flash`'s pure white is the awkward one and
should ramp toward a warm off-white rather than staying flat.

### 2. Pixel pipeline (`render.ts`)

```
draw at INTERNAL_SIZE (44) → quantise to the element's ramp → upscale ×3 → FRAME_SIZE (132)
```

- **`INTERNAL_SIZE = 44`, `PIXEL_SCALE = 3`, `FRAME_SIZE = 132`.** `FRAME_SIZE`
  changes from 128 — see "Integer scaling" below; this is not optional.
- **Quantisation:** per pixel, compute `luminance × coverage`, map onto the ramp,
  write that rung at full alpha. Fully transparent pixels stay transparent. Hard
  steps, no dither.
- Quantisation runs on the 44px buffer *before* upscaling, so the ramp bands are
  whole pixels rather than being resampled.

**Integer scaling is load-bearing.** Nearest-neighbour at a non-integer ratio
produces pixels of uneven size — some 3 screen-px wide, some 4 — which reads as a
rendering fault rather than as pixel art. **The mockups the user judged used a
non-integer 3.82× scale**; production must not. 44 × 3 = 132, so `FRAME_SIZE`
becomes 132. (Keeping 128 would force 2.909×.)

### 3. Cadence (`types.ts`, `render.ts`)

```ts
frames: number;   // discrete frames in ONE cycle — default 4
loops: number;    // how many times the cycle repeats — per-effect, default 3
frameMs: number;  // how long each frame is held — default 100
```

`durationMs` stops being an authored field and becomes derived:
`effectDurationMs(def) = frames × loops × frameMs`. Frame *i* is sampled at its
**midpoint** — `progress = (i + 0.5) / frames` — so a 4-frame cycle yields four
evenly-spaced distinct states rather than always starting at zero.

Per-effect `loops` is what lets a sustained aura and a fast melee impact both feel
right; EO's own loop counts span 1–8. Impact-role kinds should default low.

### 4. Three layers (`kinds.ts`, `render.ts`)

```ts
export type DepthLayer = 'behind' | 'tint' | 'front';
```

(Deliberately **not** named `VfxLayer` — that already exists and means
matrix/combo/special.)

`KindConfig.draw` becomes three optional-but-one-required functions:

```ts
draw: {
  behind?: DrawFn;   // under the character — far side of rings, ground residue
  tint?: DrawFn;     // blended ONTO the character — the distinctly EO glow
  front: DrawFn;     // over the character — near side, sparks, highlights
}
```

`renderFrameCanvas(def, frameIndex)` returns
`{ behind?: HTMLCanvasElement; tint?: HTMLCanvasElement; front: HTMLCanvasElement }`.
`drawEffectAt` gains a `layer` parameter so the editor can composite in order.

**Migration stance:** all 15 kinds move to the new signature in this phase, with
their existing artwork landing in `front`. Two exemplars — `ring` and `shockwave`,
both naturally ground-plane shapes — author all three layers to prove the pipeline
end to end. The rest gain `behind`/`tint` in Phase 3.

### 5. eoweb renderer

`ResolvedVfx.frames: Texture[]` becomes three arrays. `SkillBurst` mounts **three
sprites** instead of one, at z-positions relative to the target character rather
than a single high zIndex, with the `tint` sprite blended over the character.
`getFrames` stays synchronous and lazily-built; the sheet path is unaffected.

### 6. aio-editor preview

`VfxPreview` composites `behind → character stand-in → tint → front` on its canvas.
A simple silhouette is enough — the point is that an author can *see* the depth
they're choosing, which a bare effect on a checkerboard cannot show.

## Forward compatibility — set pieces (the next project)

Not built here, but the design must not preclude it:

- **Origin offset + non-square frames.** A descent effect spans ~288px vertically
  (EO uses `offsetY: -160` against a ~128 frame). `FRAME_SIZE` should therefore be
  read as "the default square frame", not as a global assumption — anywhere it's
  used as *both* width and height needs to tolerate a per-def `frameWidth`/
  `frameHeight` later.
- **Multi-stage timing.** `frames × loops` covers a repeating cycle but not
  approach → impact → dissipate. A set piece will need stages with their own frame
  counts. Keep cadence fields on the def rather than on the kind so a future
  composition can override them per stage.
- **Registry shape.** Set pieces become a fourth layer beside matrix/combos/
  specials, element-parameterised and size-less — i.e. `hasElement: true,
  hasSize: false`, exactly like combos. **They therefore need no aio-editor UI
  change**: they appear in the existing Shape dropdown automatically.

## What stays untouched

All **379 names remain valid** — this is a rendering change, not a naming one, so
**no pub re-authoring**. No server, wire, or pub-format change; still client-only,
reoserv untouched. `buildRegistry`/`buildIndex`/`buildShapes`/`composeVfxName` keep
their signatures. The sync script, `vfx:parity`, and the round-trip assertion carry
over unchanged. The two curated sprite sheets are unaffected — they bypass the
procedural pipeline entirely.

## Testing

Both repos gate on `tsc`; eoweb adds `biome`; neither has a unit-test runner, so
engine assertions ride `scripts/vfx-registry-check.ts` (`pnpm vfx:check`).

- **Registry invariants hold:** still 379 names, still 31 shapes, round-trip
  `compose(decompose(name)) === name` still passes. This rework must not perturb
  any of it.
- **New assertions:** every ramp has 4 rungs and its `base` rung equals the
  documented combat-element colour; every kind exposes a `front` draw; every def
  has `frames > 0`, `loops > 0`, `frameMs > 0`; `FRAME_SIZE === INTERNAL_SIZE ×
  PIXEL_SCALE` (guards the integer-scaling rule against a future edit).
- **Determinism survives** the quantisation pass — same `(def, frame)` must still
  produce identical pixels, since eoweb rasterises to fixed textures while the
  editor animates live.
- **Cross-repo parity** (`pnpm vfx:parity`) still passes after re-sync.
- **Manual (browser + game, human):** all 15 kinds surveyed at 44px for
  break-up; `ring`/`shockwave` show correct depth around a character in-game;
  loop cadence reads as intended; no shimmer; the editor preview matches the game.

## Risks

- **Some kinds will look worse before better.** `sparkle`, `chains` and
  `burst-lines` rely on 1–2px strokes; at 44px with hard ramp steps they will
  break up. Expect a per-kind tuning pass, not a clean sweep. This is the most
  likely source of iteration.
- **Default duration more than triples** (350ms → 1200ms). Per-effect `loops` is
  the mitigation and impact kinds must default low, or combat will feel sluggish.
- **3× sprite count per burst.** Bursts are transient so this is probably fine,
  but it's the hot path and worth watching.
- **`FRAME_SIZE` 128 → 132** touches every consumer that assumed 128, including
  the editor's fixed-size canvas and `drawEffectAt`'s clear rect.
- **The mockups were judged at a non-integer scale.** Production's even pixels
  will look slightly crisper than what was approved — better, but not identical.
