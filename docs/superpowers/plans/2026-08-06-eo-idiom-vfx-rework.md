# EO-Idiom VFX Rework — Phase 1 + Layer Plumbing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the 379-effect generated VFX palette into Endless Online's visual idiom — pixel-scaled, ramp-coloured, looped cadence — and wire the three-layer depth API end to end through both repos.

**Architecture:** The engine keeps a **128px design coordinate space** (all 15 kinds' geometry constants are already tuned to it), rasterises at **44px** via `ctx.scale`, quantises each pixel onto a 4-shade element ramp, then upscales **×3** to a 132px output frame. Cadence becomes discrete frames × per-effect loops. Each kind's single `draw` becomes three depth layers (behind / tint / front) that eoweb mounts as three sprites around the character and the editor composites around a stand-in.

**Tech Stack:** TypeScript, Canvas2D (`vfx-engine`), Pixi.js v8 (eoweb), Preact/React (aio-editor), tsx for headless engine checks.

Read the companion spec first: `eoweb/docs/superpowers/specs/2026-08-06-eo-idiom-vfx-rework-design.md`.

## Global Constraints

- **Three size constants, and they are not interchangeable:**
  - `DESIGN_SIZE = 128` — the coordinate space every `draw` function writes in. **Unchanged.** All 15 kinds' geometry constants are tuned to it (worst-case Chebyshev extent ≤ 62px at `sizeScale` 1.5). **Do NOT rewrite those constants.**
  - `INTERNAL_SIZE = 44` — the raster resolution. Reached with `ctx.scale(INTERNAL_SIZE / DESIGN_SIZE)`, never by editing draw code.
  - `FRAME_SIZE = 132` — the output frame (`INTERNAL_SIZE × PIXEL_SCALE`, `PIXEL_SCALE = 3`). **This replaces the old 128.**
- **The upscale ratio MUST be an integer.** A fractional nearest-neighbour scale yields unevenly-sized pixels, which reads as a rendering fault rather than pixel art. An assertion enforces `FRAME_SIZE === INTERNAL_SIZE * PIXEL_SCALE`.
- **`buildRegistry()` must still yield exactly 379 names**, `buildShapes()` 31, and the round-trip `compose(decompose(name)) === name` must still pass for every name. This is a rendering change, not a naming one. **No pub re-authoring; no server/wire/schema change; do NOT touch `/Users/cfraser/Projects/reoserv`** (it holds unrelated uncommitted work).
- **Determinism is inviolable.** No `Math.random()` anywhere; all jitter derives from particle index. Same `(def, frameIndex)` must paint identical pixels — eoweb rasterises to fixed textures while the editor animates live.
- **The engine stays framework-agnostic:** zero imports of Pixi, Preact, or any `@/` repo path inside `src/vfx-engine/`. It is copied verbatim into another repository.
- **The engine is CANONICAL IN EOWEB.** After any engine edit: `bash scripts/sync-vfx-engine.sh`, then `pnpm vfx:parity`. **Never hand-edit `aio-editor/packages/frontend/src/vfx-engine/`.**
- **The two sprite-sheet effects bypass all of this.** `cast-burst`/`fire-impact` resolve via `SHEET_DEFS` before the procedural registry, in both repos. Nothing in this plan may change that precedence or their rendering.
- **Membership lookups keyed by content strings must be prototype-safe** — `Set` of `Object.keys(...)`, never `key in obj`. `Object.hasOwn` is unavailable (eoweb targets ES2020).
- **Gates:** eoweb → `pnpm exec tsc --noEmit`, `pnpm exec biome check <paths>`, `pnpm vfx:check`, `pnpm vfx:parity`. aio-editor → `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` (**no biome, no test runner**; `noUnusedLocals`/`noUnusedParameters`/`noUncheckedIndexedAccess` are ON).
- **Commits end with:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SwtWSvDfpcx35jqCbNXd6K
  ```
  Branch `feat/eo-idiom-vfx` in each repo; ff-merge to local `master` at the end. **Never push.** Never run `git checkout --`, `git reset`, `git clean`, or `git stash` on unstaged paths.

---

## File Structure

**eoweb (canonical engine):**
- Modify: `src/vfx-engine/palette.ts` (Ramp type + 7 authored ramps), `types.ts` (size constants, `ramp`, cadence fields, `DepthLayer`), `kinds.ts` (colour helpers take a ramp; `draw` becomes 3 layers), `registry.ts` (specials get ramps; cadence defaults), `render.ts` (scale + quantise + upscale; 3-layer output).
- Modify: `scripts/vfx-registry-check.ts` (new assertions).
- Modify: `src/render/vfx/vfx-loader.ts` (`ResolvedVfx` → 3 texture arrays), `src/render/vfx/skill-burst.ts` (3 sprites).

**aio-editor:**
- Modify: `packages/frontend/src/pubs/form/VfxPreview.tsx` (composite 3 layers + character stand-in).
- Sync-only: `packages/frontend/src/vfx-engine/*`.

**Task order:** 1 palette → 2 pixel pipeline → 3 cadence → 4 layer API → 5 exemplar layers → 6 eoweb renderer → 7 editor preview → 8 tuning + integration.

Tasks 1–5 are engine (eoweb, each followed by a sync). 6 is eoweb render layer. 7 is aio-editor. 8 is cross-repo.

---

### Task 1: Ramped palette

**Files:** Modify `src/vfx-engine/palette.ts`, `types.ts`, `kinds.ts`, `registry.ts`, `scripts/vfx-registry-check.ts`.

**Interfaces (Produces — later tasks depend on these exact shapes):**
```ts
// palette.ts
export type Ramp = readonly [shadow: number, mid: number, base: number, hot: number];
export const ELEMENTS: Record<ElementKey, Ramp>;
export const RAMP_BASE = 2; // index of the rung that must equal the combat colour

// types.ts — VfxDef.color: number  ->  VfxDef.ramp: Ramp
```

- [ ] **Step 1: Add the `Ramp` type and authored ramps** in `palette.ts`, replacing the flat `ELEMENTS`:

```ts
/** shadow -> mid -> base -> hot. Index 2 (`base`) MUST stay the combat-element
 *  colour from src/combat-overlay/element-colors.ts — the engine mirrors that
 *  palette, and the ramp extends it rather than replacing it.
 *
 *  Authored by eye, NOT computed from the base: a mechanical darken/lighten
 *  gives muddy shadows on the warm elements and washed-out highlights on the
 *  cool ones. 7 x 4 values; this is art, not maths. */
export type Ramp = readonly [shadow: number, mid: number, base: number, hot: number];

export const RAMP_BASE = 2;

export const ELEMENTS: Record<ElementKey, Ramp> = {
  neutral: [0x57534e, 0xa8a29e, 0xfff8e1, 0xffffff],
  fire:    [0x7c2d12, 0xea580c, 0xfb923c, 0xfed7aa],
  water:   [0x1e3a8a, 0x2563eb, 0x60a5fa, 0xbfdbfe],
  earth:   [0x365314, 0x4d7c0f, 0x84cc16, 0xd9f99d],
  wind:    [0x854d0e, 0xca8a04, 0xfacc15, 0xfef08a],
  light:   [0xa16207, 0xeab308, 0xfde047, 0xfefce8],
  dark:    [0x3b0764, 0x7c3aed, 0xa855f7, 0xddd6fe],
};
```

- [ ] **Step 2: Change `VfxDef.color` to `ramp`** in `types.ts`:

```ts
export interface VfxDef {
  kind: ShapeKind;
  ramp: Ramp;            // was: color: number
  sizeScale: number;
  durationMs: number;
  additive: boolean;
  frames: number;
  combo?: ShapeKind;
}
```
Import `Ramp` from `./palette`. (`types.ts` importing from `palette.ts` is fine — both are inside the engine.)

- [ ] **Step 3: Update the colour helpers in `kinds.ts`** so draw code reads rungs rather than one colour. Replace the existing `toHex`/`toRgba`/`lighten` with:

```ts
import { RAMP_BASE, type Ramp } from './palette';

/** A rung of the def's ramp as a CSS hex. Index is clamped, so `rung(def, 4)`
 *  is the hot rung rather than a crash. */
function rung(def: VfxDef, index: number): string {
  const i = Math.max(0, Math.min(def.ramp.length - 1, index));
  const c = def.ramp[i] as number;
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** The def's base rung — the drop-in replacement for the old `toHex(def.color)`. */
function base(def: VfxDef): string {
  return rung(def, RAMP_BASE);
}

function rungRgba(def: VfxDef, index: number, alpha: number): string {
  const i = Math.max(0, Math.min(def.ramp.length - 1, index));
  const c = def.ramp[i] as number;
  return `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${alpha})`;
}
```

Then update every call site: `toHex(def.color)` → `base(def)`; `toRgba(def.color, a)` → `rungRgba(def, RAMP_BASE, a)`; `lighten(def.color, x)` → `rung(def, RAMP_BASE + 1)` (the hot rung now *is* the highlight, so the `lighten` helper is deleted). Work through `kinds.ts` top to bottom; `tsc` will find any you miss because `def.color` no longer exists.

- [ ] **Step 4: Give the 8 specials their own ramps** in `registry.ts`. They carry hardcoded colours outside the element table:

```ts
const SPECIAL_RAMPS: Record<string, Ramp> = {
  'heal-glow':    [0x14532d, 0x16a34a, 0x86efac, 0xdcfce7],
  'buff-aura':    [0x78350f, 0xd97706, 0xffcc44, 0xfef3c7],
  'debuff-sink':  [0x3b0764, 0x7c3aed, 0xa855f7, 0xddd6fe],
  'shield-flash': [0x1e3a8a, 0x3b82f6, 0x93c5fd, 0xdbeafe],
  'cast-arcane':  [0x4c1d95, 0x8b5cf6, 0xc4b5fd, 0xede9fe],
  'level-up':     [0xa16207, 0xeab308, 0xfde047, 0xfefce8],
  // Pure white has nowhere to ramp UP, so it ramps toward a warm off-white
  // instead of staying flat — otherwise quantisation collapses it to one rung.
  'crit-flash':   [0x78716c, 0xd6d3d1, 0xffffff, 0xffffff],
  'stun-stars':   [0xa16207, 0xeab308, 0xfde047, 0xfefce8],
};
```
Change each `SPECIALS` entry's `color:` to `ramp: SPECIAL_RAMPS['<name>']`, and the matrix/combo loops' `color: ELEMENTS[element]` to `ramp: ELEMENTS[element]`.

- [ ] **Step 5: Add ramp assertions** to `scripts/vfx-registry-check.ts`, before the final `console.log`:

```ts
import { ELEMENTS, RAMP_BASE } from '@/vfx-engine';

// The combat-element colours the engine palette mirrors. If these drift, the
// damage numbers and the VFX stop agreeing about what "fire" looks like.
const COMBAT_COLORS: Record<string, number> = {
  neutral: 0xfff8e1, fire: 0xfb923c, water: 0x60a5fa, earth: 0x84cc16,
  wind: 0xfacc15, light: 0xfde047, dark: 0xa855f7,
};

for (const [element, ramp] of Object.entries(ELEMENTS)) {
  assert(ramp.length === 4, `${element}: ramp must have 4 rungs, got ${ramp.length}`);
  for (const c of ramp) {
    assert(Number.isInteger(c) && c >= 0 && c <= 0xffffff, `${element}: bad rung ${c}`);
  }
  assert(
    ramp[RAMP_BASE] === COMBAT_COLORS[element],
    `${element}: base rung 0x${(ramp[RAMP_BASE] as number).toString(16)} != combat colour 0x${COMBAT_COLORS[element]?.toString(16)}`,
  );
}

for (const name of names) {
  const def = registry[name];
  assert(Array.isArray(def.ramp) && def.ramp.length === 4, `${name}: def.ramp must have 4 rungs`);
}
```

- [ ] **Step 6: Gates + sync + commit.**

```
pnpm vfx:check          # 379 effects, 379 names / 31 shapes / round-trip OK, ramp assertions pass
pnpm exec tsc --noEmit
pnpm exec biome check --write src/vfx-engine scripts && pnpm exec biome check src/vfx-engine scripts
bash scripts/sync-vfx-engine.sh && pnpm vfx:parity
```
Commit in both repos (the sync writes into aio-editor). **aio-editor's `tsc` will now FAIL** — `VfxPreview` still reads the old shape. That is expected and Task 7 fixes it; note it in your report and do not patch it here.

---

### Task 2: Pixel pipeline

**Files:** Modify `src/vfx-engine/types.ts`, `render.ts`, `scripts/vfx-registry-check.ts`.

**Interfaces:**
```ts
// types.ts
export const DESIGN_SIZE = 128;   // draw-function coordinate space — UNCHANGED
export const INTERNAL_SIZE = 44;  // raster resolution
export const PIXEL_SCALE = 3;     // integer upscale
export const FRAME_SIZE = 132;    // INTERNAL_SIZE * PIXEL_SCALE — was 128
```

- [ ] **Step 1: Replace `FRAME_SIZE` in `types.ts`** with the four constants above, each commented with what it means and why the ratio must be integral.

- [ ] **Step 2: Add the quantiser to `render.ts`:**

```ts
/** Snap every painted pixel onto the def's 4-rung ramp, using its own perceived
 *  brightness weighted by coverage as the index, and write it at full alpha.
 *  Hard steps, no dither: a screen-space dither pattern shimmers when the shape
 *  animates through it (explicitly rejected during design).
 *
 *  Runs on the INTERNAL_SIZE buffer, BEFORE upscaling, so the ramp bands are
 *  whole pixels rather than being resampled into gradients. */
function quantizeToRamp(ctx: CanvasRenderingContext2D, size: number, ramp: Ramp): void {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] as number;
    if (a === 0) continue;
    const lum =
      (((0.299 * (d[i] as number) +
         0.587 * (d[i + 1] as number) +
         0.114 * (d[i + 2] as number)) / 255) * a) / 255;
    let idx = Math.round(lum * ramp.length) - 1;
    if (idx < 0) {
      d[i + 3] = 0;
      continue;
    }
    if (idx >= ramp.length) idx = ramp.length - 1;
    const c = ramp[idx] as number;
    d[i] = (c >> 16) & 0xff;
    d[i + 1] = (c >> 8) & 0xff;
    d[i + 2] = c & 0xff;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
```

- [ ] **Step 3: Rewrite `renderFrameCanvas` as raster → quantise → upscale:**

```ts
export function renderFrameCanvas(def: VfxDef, frameIndex: number): HTMLCanvasElement {
  // 1. Rasterise at INTERNAL_SIZE. Draw functions keep writing in the 128px
  //    DESIGN_SIZE space and ctx.scale does the reduction — their geometry
  //    constants are tuned to that space (Chebyshev extent <= 62px at
  //    sizeScale 1.5) and must NOT be rewritten.
  const small = document.createElement('canvas');
  small.width = INTERNAL_SIZE;
  small.height = INTERNAL_SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('vfx-engine: failed to acquire a 2d canvas context');

  const k = INTERNAL_SIZE / DESIGN_SIZE;
  sctx.save();
  sctx.scale(k, k);
  sctx.globalCompositeOperation = def.additive ? 'lighter' : 'source-over';
  // Keep the EXISTING progress formula here — Task 3 replaces it with
  // midpoint sampling. Do not forward-reference frameProgress(); it does not
  // exist yet at this point in the plan.
  const progress = frameIndex / def.frames;
  KINDS[def.kind].draw(sctx, progress, def, DESIGN_SIZE / 2, DESIGN_SIZE / 2);
  if (def.combo) {
    KINDS[def.combo].draw(sctx, progress, def, DESIGN_SIZE / 2, DESIGN_SIZE / 2);
  }
  sctx.restore();

  // 2. Quantise onto the ramp while still at raster resolution.
  quantizeToRamp(sctx, INTERNAL_SIZE, def.ramp);

  // 3. Upscale by an INTEGER factor with smoothing off. A fractional ratio
  //    produces pixels of uneven size, which reads as a rendering fault.
  const out = document.createElement('canvas');
  out.width = FRAME_SIZE;
  out.height = FRAME_SIZE;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('vfx-engine: failed to acquire a 2d canvas context');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(small, 0, 0, INTERNAL_SIZE, INTERNAL_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
  return out;
}
```

- [ ] **Step 4: Give `drawEffectAt` the same treatment.** The editor animates through it continuously, so it must produce the identical look. Render to an internal-size scratch canvas (module-level and reused — do NOT allocate per frame), quantise, then `drawImage` it into the caller's context at `(cx - FRAME_SIZE/2, cy - FRAME_SIZE/2)` with `imageSmoothingEnabled = false`. Keep the existing `clearRect` of the `FRAME_SIZE` region first.

- [ ] **Step 5: Add the integer-scale assertion** to `scripts/vfx-registry-check.ts`:

```ts
import { DESIGN_SIZE, FRAME_SIZE, INTERNAL_SIZE, PIXEL_SCALE } from '@/vfx-engine';

assert(
  FRAME_SIZE === INTERNAL_SIZE * PIXEL_SCALE,
  `FRAME_SIZE ${FRAME_SIZE} must equal INTERNAL_SIZE ${INTERNAL_SIZE} * PIXEL_SCALE ${PIXEL_SCALE} — a fractional upscale gives unevenly-sized pixels`,
);
assert(Number.isInteger(PIXEL_SCALE) && PIXEL_SCALE >= 1, 'PIXEL_SCALE must be a positive integer');
assert(DESIGN_SIZE === 128, 'DESIGN_SIZE is the tuned draw space — changing it invalidates every kind\'s geometry budget');
```

- [ ] **Step 6: Gates + sync + commit** (same commands as Task 1 Step 6). `vfx:check` must still report 379.

---

### Task 3: Discrete cadence

**Files:** Modify `src/vfx-engine/types.ts`, `kinds.ts`, `registry.ts`, `render.ts`, `scripts/vfx-registry-check.ts`.

**Interfaces:**
```ts
// types.ts — on VfxDef, replacing authored durationMs
frames: number;    // discrete frames in ONE cycle (default 4)
loops: number;     // cycle repeats (per-effect; EO spans 1-8)
frameMs: number;   // hold time per frame (default 100)

// render.ts
export function effectDurationMs(def: VfxDef): number;  // frames * loops * frameMs
export function frameProgress(def: VfxDef, frameIndex: number): number; // midpoint sampling
```

- [ ] **Step 1: Replace `durationMs` on `VfxDef`** with `loops` and `frameMs` (keep `frames`). Add to `KindConfig` the same `frames`/`loops`/`frameMs` defaults, replacing its `durationMs`.

- [ ] **Step 2: Set per-kind cadence defaults in `kinds.ts`.** Impact-role kinds get **low loops** or combat feels sluggish; sustained kinds loop more:

```
frames 4, loops 1, frameMs 100   ->  ring, disc, spark-burst, slash, nova, shockwave, implode, burst-lines   (impacts, 400ms)
frames 4, loops 3, frameMs 100   ->  sparkle, spiral, vortex, orbit, chains, rain, beam-pop                  (sustained, 1200ms)
```
Specials override individually: `buff-aura` and `heal-glow` are sustained (`loops: 3`); `crit-flash` is a single fast pop (`frames: 4, loops: 1, frameMs: 60`).

- [ ] **Step 3: Add the two functions to `render.ts`,** then replace Task 2's placeholder `const progress = frameIndex / def.frames` inside `renderFrameCanvas` with `frameProgress(def, frameIndex)`:

```ts
/** Total playback time: one cycle of `frames`, repeated `loops` times. */
export function effectDurationMs(def: VfxDef): number {
  return def.frames * def.loops * def.frameMs;
}

/** Progress to draw for a given ABSOLUTE frame index (0 .. frames*loops-1).
 *  Sampled at the frame's MIDPOINT so a 4-frame cycle yields four evenly
 *  spaced distinct states instead of always starting at zero — at progress 0
 *  seven of the fifteen kinds are geometrically degenerate (zero radius /
 *  length / height) and would render blank. The index wraps within the cycle,
 *  which is what makes loops repeat rather than continue expanding. */
export function frameProgress(def: VfxDef, frameIndex: number): number {
  const f = ((frameIndex % def.frames) + def.frames) % def.frames;
  return (f + 0.5) / def.frames;
}
```

- [ ] **Step 4: Rasterise one cycle, not the whole playback.** `renderFrameCanvas` is called for `frameIndex` in `[0, def.frames)` only — looping is playback-side, so the same textures are reused each loop rather than duplicated. Confirm no caller iterates to `frames * loops`.

- [ ] **Step 5: Assertions** in the check script: every def has `frames > 0`, `loops > 0`, `frameMs > 0`, all integers; `effectDurationMs(def) > 0`; and `frameProgress(def, i)` lies in `(0, 1)` for every `i` in `[0, frames)` — never exactly 0 or 1.

- [ ] **Step 6: Gates + sync + commit.**

---

### Task 4: Three-layer engine API

**Files:** Modify `src/vfx-engine/types.ts`, `kinds.ts`, `render.ts`, `scripts/vfx-registry-check.ts`.

**Interfaces:**
```ts
// types.ts
export type DepthLayer = 'behind' | 'tint' | 'front';
export const DEPTH_LAYERS: readonly DepthLayer[] = ['behind', 'tint', 'front'];

// kinds.ts
export type DrawFn = (ctx: CanvasRenderingContext2D, progress: number, def: VfxDef, cx: number, cy: number) => void;
export interface KindConfig {
  frames: number; loops: number; frameMs: number; additive: boolean;
  draw: { behind?: DrawFn; tint?: DrawFn; front: DrawFn };
}

// render.ts
export interface LayerCanvases {
  behind?: HTMLCanvasElement;
  tint?: HTMLCanvasElement;
  front: HTMLCanvasElement;
}
export function renderFrameCanvas(def: VfxDef, frameIndex: number): LayerCanvases;
export function drawEffectAt(ctx, def, progress, cx, cy, layer: DepthLayer): void;
```

**⚠️ `DepthLayer` is deliberately NOT named `VfxLayer`** — that already exists in `registry.ts` and means `'matrix' | 'combo' | 'special'`. Do not rename either.

- [ ] **Step 1: Add `DepthLayer` / `DEPTH_LAYERS`** to `types.ts` and export from the barrel.

- [ ] **Step 2: Migrate all 15 kinds to the object form.** Each kind's existing draw body moves verbatim into `front`; `behind` and `tint` are left undefined for now (Task 5 fills two of them). Worked example — `ring` goes from:

```ts
ring: { durationMs: 350, frames: 12, additive: true, draw: drawRing },
```
to:
```ts
ring: { frames: 4, loops: 1, frameMs: 100, additive: true, draw: { front: drawRing } },
```

Apply the identical transformation to all fifteen: `ring`, `disc`, `spark-burst`, `slash`, `spiral`, `sparkle`, `nova`, `shockwave`, `beam-pop`, `implode`, `vortex`, `rain`, `chains`, `orbit`, `burst-lines`. Do not alter any draw function's body in this task.

- [ ] **Step 3: `renderFrameCanvas` returns `LayerCanvases`.** Factor the Task-2 raster→quantise→upscale sequence into a helper taking a `DrawFn[]`, then call it once per layer that has content:
  - `behind`: `[KINDS[def.kind].draw.behind]` plus the combo's `behind` if both exist
  - `tint`: same for `tint`
  - `front`: same for `front` (always present)
  Layers with no draw function are **omitted** rather than returned as empty canvases — an empty texture is wasted GPU memory per effect, and consumers already have to handle `undefined`.

- [ ] **Step 4: `drawEffectAt` gains a required `layer` parameter** and draws only that layer, returning early if the kind has no function for it. The editor calls it three times per frame to composite.

- [ ] **Step 5: Assertions:** every kind exposes a `front` draw; every `DEPTH_LAYERS` entry is a valid key; for every def, `renderFrameCanvas(def, 0).front` is non-null. (The check script cannot call these — no DOM canvas headless — so assert on `KINDS[k].draw.front` being a function instead, and leave rasterisation to the manual pass.)

- [ ] **Step 6: Gates + sync + commit.** eoweb `tsc` will fail until Task 6 updates `vfx-loader`; fix `vfx-loader` minimally here **only** to keep the build green (consume `.front`, ignore the others) and leave the real 3-sprite work to Task 6. State clearly in your report that you did so.

---

### Task 5: Exemplar three-layer authoring — `ring` and `shockwave`

**Files:** Modify `src/vfx-engine/kinds.ts`.

Both are naturally ground-plane shapes, so they're the honest test of whether the layer split reads.

- [ ] **Step 1: Split `ring`.** The ring becomes a squashed ground ellipse (`ry = rx * 0.42`) around the character's feet, drawn as two arcs:
  - `behind` — the far arc, `ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2)`
  - `front` — the near arc, `ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI)`
  - `tint` — a soft wash at the base rung, `globalAlpha = (1 - progress) * 0.4`, filling a character-sized region so the glow reads on the sprite
  Keep the existing radius/alpha maths; only the arc range and the vertical squash are new. Re-verify the Chebyshev extent stays ≤ 62px at `sizeScale` 1.5 — the squash reduces vertical extent, so this should get *easier*, but measure rather than assume.

- [ ] **Step 2: Split `shockwave`** the same way — it is already a squashed ground ellipse, so the split is purely far-arc/near-arc, with a brief `tint` flash on the impact frames only (`progress < 0.5`).

- [ ] **Step 3:** Gates + sync + commit. Note in your report that the other 13 kinds remain `front`-only by design (Phase 3).

---

### Task 6: eoweb renderer — three sprites

**Files:** Modify `src/render/vfx/vfx-loader.ts`, `src/render/vfx/skill-burst.ts`.

- [ ] **Step 1: `ResolvedVfx` carries three texture arrays:**

```ts
export interface ResolvedVfx {
  behind: Texture[];   // empty array when the effect has no such layer
  tint: Texture[];
  front: Texture[];
  durationMs: number;
  additive: boolean;
  scale: number;
}
```
Use empty arrays rather than `undefined` here — the burst iterates them, and an empty loop is cheaper to reason about than a null check per frame. `buildProcedural` builds each layer from `renderFrameCanvas(def, i).<layer>`, skipping absent layers. `durationMs` comes from `effectDurationMs(def)`.

**`scale` stays `1`** for procedural effects. `sizeScale` is already baked into the rasterised frames — re-applying it on the sprite is the double-scaling bug fixed on 2026-08-05; do not reintroduce it.

- [ ] **Step 2: The sheet path is unchanged.** `buildSheet` puts its frames in `front` and leaves `behind`/`tint` empty. Sheet resolution still short-circuits ahead of the registry.

- [ ] **Step 3: `SkillBurst` mounts three sprites.** Where it currently creates one sprite, create one per non-empty layer, all advancing on the same frame clock, and set `zIndex` relative to the target character's own zIndex rather than a flat high value:
  - `behind` → character zIndex − 1
  - `tint` → character zIndex + 1, `blendMode = 'add'`
  - `front` → character zIndex + 2
  Destroy all three on completion — the existing single-sprite teardown must become a loop, or every cast leaks two sprites.

- [ ] **Step 4:** `tsc` + `biome` clean. Commit. Live rendering is verified by a human in Task 8.

---

### Task 7: aio-editor preview — composite the layers

**Files:** Modify `packages/frontend/src/pubs/form/VfxPreview.tsx`.

- [ ] **Step 1: Composite in depth order** in the procedural effect path: `behind` → character stand-in → `tint` → `front`, calling `drawEffectAt` once per layer. The canvas is `FRAME_SIZE` (now **132**, not 128) — update the fixed dimensions.

- [ ] **Step 2: Draw a character stand-in** between the layers: a simple grey humanoid (body rect + head circle + soft ground shadow) centred with its feet at the canvas centre. Without it the layer split is invisible and the whole feature is unreviewable. Add a small caption noting the figure is a stand-in for scale, not real art.

- [ ] **Step 3: Cadence.** Drive the animation from `effectDurationMs(def)` and quantise to discrete frames — `frameIndex = floor(elapsed / def.frameMs)` — rather than the old continuous progress, so the preview shows the same chunky cadence the game does. Keep the pause/resume `progressRef` behaviour.

- [ ] **Step 4: The sheet path is untouched** — sheets keep their existing `drawImage` frame-strip animation, their load-failure handling, and their precedence ahead of the registry.

- [ ] **Step 5:** `npx tsc -p tsconfig.json --noEmit` clean. Commit.

---

### Task 8: Tuning pass, integration, manual pass doc

**Files:** Modify `src/vfx-engine/kinds.ts` (tuning only); create `docs/superpowers/plans/2026-08-06-eo-idiom-vfx-rework-manual-pass.md`.

- [ ] **Step 1: Survey all 15 kinds at 44px.** Write a throwaway script under `eoweb/.superpowers/` (git-ignored) that rasterises every kind at `sizeScale` 0.6/1.0/1.5 and reports, per kind: painted-pixel count, distinct ramp rungs used, and whether any frame is entirely empty. Flag any kind that paints < 20 pixels at base size or uses only one rung — those have broken up.

- [ ] **Step 2: Tune the flagged kinds.** `sparkle`, `chains` and `burst-lines` are the expected casualties: they rely on 1–2px strokes which become sub-pixel at the 44/128 reduction. Fix by *thickening strokes and reducing element counts* in `DESIGN_SIZE` space — e.g. fewer, fatter sparkle points — not by changing `INTERNAL_SIZE`. Re-verify the Chebyshev extent budget after any geometry change.

- [ ] **Step 3: Full gate sweep across both repos** plus `git -C /Users/cfraser/Projects/reoserv status --short` showing **only** `data/pub/npcs/0007.json` and `data/pub/skills/rage.json`.

- [ ] **Step 4: Write the manual-pass doc.** Numbered steps a human runs, each with an explicit **failure** description. Cover: all 15 kinds surveyed in the editor for break-up; `ring`/`shockwave` showing correct depth around a character in-game (far arc occluded, near arc over the feet, tint on the sprite); the 4×3 loop cadence reading as intended and impacts not feeling sluggish; the two sheet effects still animating unchanged; `buff-aura` still rendering; startup not visibly slower. **Verify every effect name you cite exists** by executing `buildRegistry()` — do not pick names by eye.

- [ ] **Step 5:** Commit, then **superpowers:finishing-a-development-branch** for both repos (ff-merge to local `master`, delete branches, never push).

---

## Self-Review notes (for the executor)

- **Spec coverage:** ramps (T1), pixel pipeline (T2), cadence (T3), layer API (T4), exemplar layers (T5), eoweb renderer (T6), editor preview (T7), tuning + manual pass (T8). Set pieces and Phase-3 per-kind layers are explicitly out of scope per the spec.
- **The three size constants are the most likely thing to get wrong.** `DESIGN_SIZE` (128) is where draw functions write; `INTERNAL_SIZE` (44) is the raster; `FRAME_SIZE` (132) is the output. Reaching 44 via `ctx.scale`, never by editing geometry constants, is what preserves the existing extent tuning.
- **Type consistency:** `Ramp` (T1) → consumed by `quantizeToRamp` (T2) and every kind's colour helper. `frameProgress`/`effectDurationMs` (T3) → consumed by `renderFrameCanvas` (T2/T4), `SkillBurst` (T6), `VfxPreview` (T7). `LayerCanvases`/`DepthLayer` (T4) → consumed by T5, T6, T7.
- **Task 1 and Task 4 both leave a repo temporarily red** (aio-editor after T1, eoweb's loader after T4). Both are called out in their own steps with the expected remedy and the task that closes them. Do not paper over either beyond what the step permits.
- **Task 8's tuning is genuinely open-ended** — it's the one place the plan cannot fully specify the outcome, because which kinds break at 44px is an empirical question. Step 1's survey script exists to make it measurable rather than a matter of taste.
