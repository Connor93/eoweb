# VFX Set Pieces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four staged set-piece effects — `bolt`, `smite`, `rockfall`, `ring-of-fire` — ×7 element tints (28 names), which arrive from off-screen, impact, and leave residue.

**Architecture:** Frame geometry becomes **per-def** rather than one global square, so a descent can use a tall frame with its ground point three-quarters down. Set pieces form a **fourth registry layer** beside matrix/combos/specials — element-parameterised, size-less. Staging is authored inside ordinary draw functions (`if (progress < 0.5) …`), not a new mechanism.

**Tech Stack:** TypeScript, Canvas2D (`vfx-engine`), Pixi.js v8 (eoweb), Preact/React (aio-editor), tsx for headless checks.

Read the companion spec first: `eoweb/docs/superpowers/specs/2026-08-06-vfx-set-pieces-design.md`.

## Global Constraints

- **The registry must reach exactly 407 names** (379 existing + 28 new) and **35 shapes** (31 + 4). The round-trip `compose(decompose(name)) === name` must hold for every one. **No existing name may change or disappear**, and no existing effect may render differently.
- **Set pieces must NOT enter the kind × element × size matrix.** The matrix loop currently iterates `Object.keys(KINDS)`; it must iterate an explicit `MATRIX_KINDS` list, or each set piece silently gains 21 matrix names.
- **`DESIGN_SIZE = 128` is still the draw-function coordinate space** and the 15 existing kinds' geometry constants stay untouched. A taller frame changes the *canvas*, never the constants.
- **Integer upscale, now per axis:** `outW === internalW × PIXEL_SCALE` and `outH === internalH × PIXEL_SCALE`. A fractional ratio on either axis yields unevenly-sized pixels. Descent frames are design `128×256` → internal `44×88` → output `132×264`.
- **Draw functions receive the GROUND POINT as `(cx, cy)`**, not the frame centre — `(64, 192)` in a tall frame, `(64, 64)` in a square one. Existing kinds must keep receiving exactly what they receive today.
- **Extent budgets are per-axis and asymmetric for tall frames:** horizontal ≤ 62px from centre; vertical ≤ 126px **above** and ≤ 62px **below** the ground point. All headroom is upward.
- **Descents are fast: `frames: 4, loops: 1, frameMs: 100` (400ms).** Skills have **no cast time** — damage and `impact_vfx` resolve together — so a slow descent would land its impact after the damage number. Do not lengthen them.
- **Determinism is inviolable:** no `Math.random()`; all jitter index-derived. Same `(def, frameIndex)` → identical pixels.
- The engine stays **framework-agnostic**: zero imports of Pixi/Preact/`@/` inside `src/vfx-engine/`.
- **The engine is CANONICAL IN EOWEB.** After any engine edit: `bash scripts/sync-vfx-engine.sh`, then `pnpm vfx:parity`. **Never hand-edit `aio-editor/packages/frontend/src/vfx-engine/`.**
- **`Record<string, T>` inside the engine is a cross-repo hazard** — aio-editor sets `noUncheckedIndexedAccess`, which widens such a lookup to `T | undefined` and fails *inside the vendored engine*. (`Record<ClosedUnion, T>` indexed by that union stays total; the exemption does NOT extend to string keys.) Use literal-union keys.
- **Client-only.** No server, wire, pub-format, or editor-UI change. **Do not touch `/Users/cfraser/Projects/reoserv`** (it holds unrelated uncommitted work).
- **The two sprite sheets** (`cast-burst`, `fire-impact`) bypass the procedural pipeline and resolve *first* in both consumers. Nothing here may change that.
- **Gates:** eoweb → `pnpm exec tsc --noEmit`, `pnpm exec biome check <paths>`, `pnpm vfx:check`, `pnpm vfx:parity`. aio-editor → `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` (**no biome, no test runner**; `noUnusedLocals`/`noUnusedParameters`/`noUncheckedIndexedAccess` all ON).
- **Commits end with:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SwtWSvDfpcx35jqCbNXd6K
  ```
  Branch `feat/vfx-set-pieces` in each repo; ff-merge to local `master` at the end. **Never push.** Never run `git checkout --`, `git reset`, `git clean`, or `git stash` on unstaged paths.

---

## File Structure

**eoweb (canonical engine):**
- Modify: `src/vfx-engine/types.ts` (`FrameGeometry`, `makeFrame`, `SQUARE_FRAME`, `TALL_FRAME`, `VfxDef.frame`, 4 new `ShapeKind`s), `render.ts` (per-def raster/ground-point/upscale), `registry.ts` (`MATRIX_KINDS`, `SET_PIECES`, `'setpiece'` layer), `kinds.ts` (4 set-piece draw functions).
- Modify: `scripts/vfx-registry-check.ts` (per-axis + no-matrix-leak assertions).
- Modify: `src/render/vfx/vfx-loader.ts`, `src/render/vfx/skill-burst.ts` (per-def anchor).

**aio-editor:**
- Modify: `packages/frontend/src/pubs/form/VfxPreview.tsx` (non-square canvas, stand-in at ground point).
- Sync-only: `packages/frontend/src/vfx-engine/*`.

**Task order:** 1 frame geometry → 2 eoweb anchor → 3 editor non-square → 4 registry layer → 5 `bolt`+`smite` → 6 `rockfall`+`ring-of-fire` → 7 integration.

Tasks 1, 4, 5, 6 are engine (each followed by a sync). 2 is eoweb's render layer. 3 is aio-editor. 7 is cross-repo.

---

### Task 1: Per-def frame geometry

**Files:** Modify `src/vfx-engine/types.ts`, `render.ts`, `registry.ts`, `scripts/vfx-registry-check.ts`.

**Interfaces (Produces — later tasks depend on these exact shapes):**
```ts
export interface FrameGeometry {
  designW: number;    // draw-space width  (always 128 today)
  designH: number;    // draw-space height (128 square, 256 tall)
  groundY: number;    // draw-space y handed to draw functions as `cy`
  internalW: number;  // raster width
  internalH: number;  // raster height
  outW: number;       // internalW * PIXEL_SCALE
  outH: number;       // internalH * PIXEL_SCALE
  anchorY: number;    // groundY / designH — the sprite's vertical anchor
}
export const SQUARE_FRAME: FrameGeometry;  // 128x128, ground 64  -> out 132x132, anchorY 0.5
export const TALL_FRAME: FrameGeometry;    // 128x256, ground 192 -> out 132x264, anchorY 0.75
// VfxDef gains:  frame: FrameGeometry;
```

- [ ] **Step 1: Add `FrameGeometry` and the two presets** to `types.ts`, below the existing size constants:

```ts
/** A def's frame: the draw-space box, where its ground point sits inside that
 *  box, and the derived raster/output sizes.
 *
 *  `designW`/`designH` are the coordinate space draw functions write in —
 *  DESIGN_SIZE stays the WIDTH unit, and a tall frame only grows downward-to-
 *  upward headroom. `groundY` is what draw functions receive as `cy`: the
 *  point that lines up with the target's feet. For a square frame that is the
 *  centre (unchanged); for a tall frame it sits three-quarters down, so the
 *  extra height is all headroom ABOVE the target for something to fall from. */
export interface FrameGeometry {
  designW: number;
  designH: number;
  groundY: number;
  internalW: number;
  internalH: number;
  outW: number;
  outH: number;
  anchorY: number;
}

/** Derives raster + output sizes from a draw-space box. The integer-upscale
 *  rule applies PER AXIS — a fractional ratio on either produces pixels of
 *  uneven size. Pick design dimensions that are whole multiples of
 *  DESIGN_SIZE/INTERNAL_SIZE (i.e. multiples of 32) so both axes stay exact. */
function makeFrame(
  designW: number,
  designH: number,
  groundY: number,
): FrameGeometry {
  const k = INTERNAL_SIZE / DESIGN_SIZE;
  const internalW = Math.round(designW * k);
  const internalH = Math.round(designH * k);
  return {
    designW,
    designH,
    groundY,
    internalW,
    internalH,
    outW: internalW * PIXEL_SCALE,
    outH: internalH * PIXEL_SCALE,
    anchorY: groundY / designH,
  };
}

/** Every effect that existed before set pieces. 128x128 design -> 44x44 raster
 *  -> 132x132 output, ground point dead centre. Identical to the old globals. */
export const SQUARE_FRAME: FrameGeometry = makeFrame(128, 128, 64);

/** Descents. 128x256 design -> 44x88 raster -> 132x264 output. The ground
 *  point is at y=192, so the bottom 128 design-px occupy exactly where a
 *  square frame would sit and the top 128 are headroom. anchorY = 0.75. */
export const TALL_FRAME: FrameGeometry = makeFrame(128, 256, 192);
```

- [ ] **Step 2: Add `frame` to `VfxDef`** (`frame: FrameGeometry;`) and import the type where needed. Do **not** make it optional — an explicit frame on every def is what stops a new def silently inheriting the wrong one.

- [ ] **Step 3: Give every existing def `SQUARE_FRAME`** in `registry.ts` — the matrix loop, the combo loop, and all 8 `SPECIALS` entries. Nothing else about them changes.

- [ ] **Step 4: Make `renderFrameCanvas` frame-aware.** Replace its uses of the global constants with `def.frame`:

```ts
export function renderFrameCanvas(def: VfxDef, frameIndex: number): LayerCanvases {
  const f = def.frame;
  // ... for each layer with content:
  const small = document.createElement('canvas');
  small.width = f.internalW;
  small.height = f.internalH;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('vfx-engine: failed to acquire a 2d canvas context');

  const k = INTERNAL_SIZE / DESIGN_SIZE;   // width-derived; both axes share it
  sctx.save();
  sctx.scale(k, k);
  sctx.globalCompositeOperation = def.additive ? 'lighter' : 'source-over';
  // GROUND POINT, not the frame centre. For SQUARE_FRAME this is (64, 64) —
  // byte-identical to what every existing kind received before this change.
  drawFn(sctx, frameProgress(def, frameIndex), def, f.designW / 2, f.groundY);
  sctx.restore();

  quantizeToRamp(sctx, f.internalW, f.internalH, def.ramp);

  const out = document.createElement('canvas');
  out.width = f.outW;
  out.height = f.outH;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('vfx-engine: failed to acquire a 2d canvas context');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(small, 0, 0, f.internalW, f.internalH, 0, 0, f.outW, f.outH);
  // ...
}
```

`quantizeToRamp` takes width and height separately now instead of one `size`.

- [ ] **Step 5: Make `drawEffectAt` frame-aware** the same way. Its `clearRect` and its `drawImage` destination must use `f.outW`/`f.outH`, and the caller-supplied `(cx, cy)` is now the **ground point** — so the destination rect's top-left is `(cx - f.outW/2, cy - f.outH * f.anchorY)`, not `cy - f.outH/2`. Its module-level scratch canvas must be **resized when the def's frame differs from the last one** (compare against the last-used dimensions and only reallocate on change; do not allocate per call).

- [ ] **Step 6: Per-axis assertions** in `scripts/vfx-registry-check.ts`:

```ts
for (const name of names) {
  const f = registry[name].frame;
  assert(f.outW === f.internalW * PIXEL_SCALE, `${name}: outW ${f.outW} != internalW ${f.internalW} * ${PIXEL_SCALE}`);
  assert(f.outH === f.internalH * PIXEL_SCALE, `${name}: outH ${f.outH} != internalH ${f.internalH} * ${PIXEL_SCALE}`);
  assert(Number.isInteger(f.internalW) && Number.isInteger(f.internalH), `${name}: raster dims must be integers`);
  assert(f.groundY > 0 && f.groundY <= f.designH, `${name}: groundY ${f.groundY} outside the frame`);
  assert(f.anchorY > 0 && f.anchorY <= 1, `${name}: anchorY ${f.anchorY} out of range`);
}
```

- [ ] **Step 7: Prove this task changed nothing visually.** Every def still uses `SQUARE_FRAME`, so output must be **byte-identical** to before. Write a throwaway script under `eoweb/.superpowers/` (git-ignored) using a canvas-capable runner that rasterises a sample of defs at the previous commit and at yours, and compares pixel buffers. Report the result. If you cannot execute it, say so plainly rather than claiming it passed.

- [ ] **Step 8: Gates + sync + commit.** `pnpm vfx:check` (**379**, unchanged), `pnpm exec tsc --noEmit`, `biome check --write` then `check` on `src/vfx-engine src/render/vfx scripts`, `bash scripts/sync-vfx-engine.sh`, `pnpm vfx:parity` (10 files). Commit in both repos. **aio-editor's `tsc` may now fail** where it reads the old globals — record the exact error set; Task 3 fixes it, do not patch consumers here.

---

### Task 2: eoweb renderer — per-def anchor

**Files:** Modify `src/render/vfx/vfx-loader.ts`, `src/render/vfx/skill-burst.ts`.

**Interfaces:** Consumes `FrameGeometry` from Task 1. `ResolvedVfx` gains `anchorY: number`.

- [ ] **Step 1: Carry the anchor through `ResolvedVfx`.** Add `anchorY: number`. `buildProcedural` sets it from `def.frame.anchorY`; `buildSheet` sets it to `0.5` (sheets are square and centred — their behaviour must not change).

- [ ] **Step 2: Apply it in `SkillBurst`.** Where sprites currently do `sprite.anchor.set(0.5)`, use `sprite.anchor.set(0.5, resolved.anchorY)`. All three depth sprites share the same anchor. Everything else — z-ordering, the additive tint blend, the frame-advance maths, teardown — is unchanged.

- [ ] **Step 3:** `pnpm exec tsc --noEmit` clean, `biome check` on `src/render/vfx` clean, `pnpm vfx:check` still 379 (you touched no engine file). Commit.

**Reason through and report:** what happens for a square effect (anchor must be unchanged at 0.5), for a sheet effect, and for a tall effect once Task 4 introduces one.

---

### Task 3: aio-editor preview — non-square frames

**Files:** Modify `packages/frontend/src/pubs/form/VfxPreview.tsx`.

- [ ] **Step 1: Size the canvas per def.** The visible canvas, the scratch layer tile, and every `clearRect` currently use the global `FRAME_SIZE`. They become `def.frame.outW` × `def.frame.outH`. The scratch tile must be **resized only when the dimensions change**, not per frame.

- [ ] **Step 2: Plant the stand-in at the ground point, not the canvas centre.** `drawCharacterStandIn` currently anchors the figure's feet at `FRAME_SIZE / 2`. It must use `outH * anchorY` — three-quarters down for a tall frame. Getting this wrong makes the depth split read wrongly for exactly the effects this project adds.

- [ ] **Step 3: Pass the ground point to `drawEffectAt`.** It currently passes `(half, half)`. It becomes `(outW / 2, outH * anchorY)`.

- [ ] **Step 4: Keep the sheet path untouched** — its own `drawImage` frame-strip animation, its module-level failed-load `Set`, and its precedence *ahead* of the generated registry. Sheets are square; they must not go through per-def frame logic.

- [ ] **Step 5:** `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` → exit 0, no output. Commit.

**Reason through and report** what renders for: a square procedural effect (must be visually unchanged), a sheet effect, and an unknown name.

---

### Task 4: The set-piece registry layer

**Files:** Modify `src/vfx-engine/types.ts`, `kinds.ts`, `registry.ts`, `scripts/vfx-registry-check.ts`.

**Interfaces:**
```ts
// types.ts — ShapeKind gains four members:
//   | 'bolt' | 'smite' | 'rockfall' | 'ring-of-fire'
// registry.ts
export type VfxLayer = 'matrix' | 'combo' | 'special' | 'setpiece';  // gains 'setpiece'
const MATRIX_KINDS: readonly ShapeKind[];   // the 15 originals ONLY
```

- [ ] **Step 1: Add the four kinds** to the `ShapeKind` union.

- [ ] **Step 2: Introduce `MATRIX_KINDS` and stop the matrix loop iterating `KINDS`.**

```ts
/** The kinds that participate in the kind x element x size matrix. Set pieces
 *  live in KINDS too (their draw functions are ordinary draw functions) but
 *  are DELIBERATELY excluded here — they are element-only and size-less, so
 *  iterating Object.keys(KINDS) would silently give each one 21 matrix names. */
const MATRIX_KINDS: readonly ShapeKind[] = [
  'ring', 'disc', 'spark-burst', 'slash', 'spiral', 'sparkle', 'nova',
  'shockwave', 'beam-pop', 'implode', 'vortex', 'rain', 'chains', 'orbit',
  'burst-lines',
];
```
Change the matrix loop's header from `for (const kind of Object.keys(KINDS) as ShapeKind[])` to `for (const kind of MATRIX_KINDS)`.

- [ ] **Step 3: Add the `SET_PIECES` table** to `registry.ts`:

```ts
type SetPieceName = 'bolt' | 'smite' | 'rockfall' | 'ring-of-fire';

interface SetPieceConfig {
  frame: FrameGeometry;
  frames: number;
  loops: number;
  frameMs: number;
}

/** Element-parameterised, size-less. Descents are FAST (400ms) on purpose:
 *  skills have no cast time, so damage and impact_vfx resolve together and a
 *  slow descent would land its impact after the damage number had already
 *  popped. `ring-of-fire` is a sustained ground effect, so it keeps the square
 *  frame and loops. */
const SET_PIECES: Record<SetPieceName, SetPieceConfig> = {
  bolt:           { frame: TALL_FRAME,   frames: 4, loops: 1, frameMs: 100 },
  smite:          { frame: TALL_FRAME,   frames: 4, loops: 1, frameMs: 100 },
  rockfall:       { frame: TALL_FRAME,   frames: 4, loops: 1, frameMs: 100 },
  'ring-of-fire': { frame: SQUARE_FRAME, frames: 4, loops: 3, frameMs: 100 },
};
```

- [ ] **Step 4: Generate them in `buildRegistry`**, after the specials loop:

```ts
  // Set pieces: each x every element, base size only.
  for (const [name, cfg] of Object.entries(SET_PIECES) as [SetPieceName, SetPieceConfig][]) {
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      registry[`${name}-${element}`] = {
        kind: name,
        ramp: ELEMENTS[element],
        sizeScale: 1,
        additive: true,
        frames: cfg.frames,
        loops: cfg.loops,
        frameMs: cfg.frameMs,
        frame: cfg.frame,
      };
    }
  }
```

- [ ] **Step 5: Extend `buildIndex`, `buildShapes` and `composeVfxName`.**

  First add the id helper alongside the existing `kindShapeId` / `comboShapeId` / `specialShapeId`, and its prefix constant next to theirs:
  ```ts
  const SETPIECE_PREFIX = 'setpiece:';
  function setPieceShapeId(name: SetPieceName): string {
    return `${SETPIECE_PREFIX}${name}`;
  }
  ```
  Then:
  - `buildIndex`: a matching loop emitting `{ layer: 'setpiece', kind: name, element, shapeId: setPieceShapeId(name) }` — **no `size`**.
  - `buildShapes`: push one entry per set piece with `hasElement: true, hasSize: false`, label from `titleCase` (`'ring-of-fire'` → `Ring Of Fire`), id `setpiece:<name>`.
  - `composeVfxName`: a `setpiece:` branch mirroring the `special:` one — validate the name against a `Set` of `Object.keys(SET_PIECES)` (**not `key in obj`** — prototype keys), require an `element` in `ELEMENT_KEYS`, and return `` `${name}-${element}` ``. Ignore any `size` argument, exactly as the combo branch does.

- [ ] **Step 6: Register the four kinds in `KINDS`** with a `front` draw that throws `unimplemented: <kind>` for now, plus `behind`/`tint` omitted. Tasks 5 and 6 replace them. The registry must generate the full 407 names **now** so this task is independently verifiable, and the check script must not call any `draw`.

- [ ] **Step 7: Assertions** in `scripts/vfx-registry-check.ts`:

```ts
assert(names.length === 407, `expected 407 effects, got ${names.length}`);
assert(shapes.length === 35, `expected 35 shapes, got ${shapes.length}`);

// Set pieces must NOT have leaked into the matrix.
for (const sp of ['bolt', 'smite', 'rockfall', 'ring-of-fire']) {
  for (const element of Object.keys(ELEMENTS)) {
    for (const suffix of ['sm', 'lg']) {
      const leaked = `${sp}-${element}-${suffix}`;
      assert(registry[leaked] === undefined, `set piece leaked into the matrix: ${leaked}`);
    }
  }
  const shape = shapes.find((s) => s.id === `setpiece:${sp}`);
  assert(shape !== undefined, `missing set-piece shape: ${sp}`);
  assert(shape.hasElement === true, `${sp}: hasElement must be true`);
  assert(shape.hasSize === false, `${sp}: hasSize must be false`);
}
```
The existing name-uniqueness and round-trip assertions must still pass over all 407.

- [ ] **Step 8: Gates + sync + commit.** `pnpm vfx:check` → **407 effects, 35 shapes, round-trip OK**. Then tsc/biome/parity as usual.

---

### Task 5: Author `bolt` and `smite`

**Files:** Modify `src/vfx-engine/kinds.ts`.

Both use `TALL_FRAME`: draw space 128 wide × 256 tall, ground point handed to you as `(cx, cy) = (64, 192)`. **All headroom is upward** — you may paint up to 126px above `cy` but no more than 62px below it, and no more than 62px either side of `cx`.

Each authors **all three depth layers**. Four frames, so `progress` takes exactly `0.125, 0.375, 0.625, 0.875`.

- [ ] **Step 1: `bolt` — a forked lightning strike.**
  - `behind`: the upper fork — a jagged polyline from `cy - 120` descending to about `cy - 30`, 2–3 branches, jitter derived from the particle index (never `Math.random()`), drawn at the base rung. On frames 0–1 it is bright and full height; on 2–3 it thins and fades.
  - `front`: the lower fork continuing from `cy - 30` into the ground point, plus a ground flash — a squashed ellipse at `cy`, widening across frames 1–3.
  - `tint`: a brief hot-rung flash over the character on frames 1–2 only, nothing on 0 and 3.
  - Read the existing `drawChains` for the established zigzag idiom and reuse its jitter helper rather than inventing another.

- [ ] **Step 2: `smite` — a descending pillar of light into a ground flash.**
  - `behind`: the pillar's rear half — a tapering vertical band from the top of the frame down to `cy`, narrow at top, widening slightly at the base. Frames 0–1 descend (the band's lower edge sweeps from `cy - 120` down to `cy`); frames 2–3 it retracts upward and fades.
  - `front`: the pillar's near half plus the ground flash at `cy`.
  - `tint`: a sustained wash over the character across frames 1–3 — this is the one set piece where a lingering tint is right, since the character is standing *in* the beam.
  - `drawBeamPop` is the closest existing idiom; read it first, but note it is anchored for a square frame and you have far more vertical room.

- [ ] **Step 3: Measure the extent** with a throwaway instrumented-context script under `eoweb/.superpowers/`: max horizontal from `cx`, max above `cy`, max below `cy`, across all 4 frames and all 7 elements. Budgets: ≤62 horizontal, ≤126 above, ≤62 below. Put the table in your report.

- [ ] **Step 4:** `pnpm vfx:check` (407 / 35 / round-trip), tsc, biome, sync, parity. Commit. Note in your report that `rockfall` and `ring-of-fire` still throw — Task 6 fills them.

---

### Task 6: Author `rockfall` and `ring-of-fire`

**Files:** Modify `src/vfx-engine/kinds.ts`.

- [ ] **Step 1: `rockfall` — several objects descending, staggered, impacting.** `TALL_FRAME`, ground point `(64, 192)`.
  - 3 rocks, positions and fall offsets derived from the particle index so they stagger rather than land together.
  - **Each rock carries a motion streak** — a short tapering line trailing upward from it. Four frames is very little runway for a fall, and the streak is what makes it read as travel rather than a jump-cut. This is the single most important detail in this task.
  - `behind`: rocks while they are above roughly `cy - 40` (i.e. up near the character's head).
  - `front`: rocks below that, plus per-rock impact puffs at the ground as each lands.
  - `tint`: a brief flash on the frame each rock lands.
  - Rocks are small filled polygons, not circles — 4–5 sided, index-derived vertices, so they read as rock rather than ball.

- [ ] **Step 2: `ring-of-fire` — a sustained encircling ground band.** `SQUARE_FRAME`, ground point `(64, 64)`, `loops: 3` so it repeats.
  - A squashed ground ellipse (`ry ≈ rx * 0.42`) at a fixed radius — it does **not** expand; it is a standing ring that flickers.
  - `behind`: the far arc, `[π, 2π]`. `front`: the near arc, `[0, π]`. (In a y-down canvas the top half is the far side — read `drawRing`, which already does this correctly, and match it.)
  - Flame tongues rising from the band: short tapering strokes at index-derived angles, height oscillating with `progress` so the loop reads as flicker rather than motion.
  - `tint`: none. A sustained ground ring should not strobe the character 3× — leave `tint` undefined.

- [ ] **Step 3: Measure the extent** for both, same budgets and method as Task 5 Step 3 (`ring-of-fire` uses the square budget: ≤62 in every direction). Table in your report.

- [ ] **Step 4:** `pnpm vfx:check` (407 / 35 / round-trip) — and confirm **no kind throws `unimplemented` any more**. tsc, biome, sync, parity. Commit.

---

### Task 7: Integration, verification, manual pass

**Files:** Create `docs/superpowers/plans/2026-08-06-vfx-set-pieces-manual-pass.md`.

- [ ] **Step 1: Full gate sweep.** eoweb `tsc`, `biome check src/vfx-engine src/render/vfx scripts`, `pnpm vfx:check` (**407 / 35 / round-trip OK**), `pnpm vfx:parity` (10 files); aio-editor `tsc` exit 0. `git -C /Users/cfraser/Projects/reoserv status --short` → **exactly** `data/pub/npcs/0007.json` and `data/pub/skills/rage.json`.

- [ ] **Step 2: Prove no existing effect changed.** Rasterise a broad sample of the 379 pre-existing names at the branch point and at `HEAD` and compare pixel buffers. They must be **byte-identical** — this whole project must be additive. Report the sample size and result.

- [ ] **Step 3: Verify every effect name you will cite** by executing `buildRegistry()`. Do not pick names by eye — a predecessor project shipped a doc whose running example never existed. Put the output in your report.

- [ ] **Step 4: Write the manual-pass doc.** Read the three sibling docs in that directory first and match their structure and tone. Numbered steps, **each with an explicit description of what FAILURE looks like**. Cover:
  1. Each of the four cast in-game at 2–3 elements; the effect appears where the target is, not offset or clipped.
  2. **The descent-vs-damage sync** — the impact must land within a few frames of the damage number. If it visibly trails, the 400ms budget is wrong.
  3. **Does the fall read as a fall, or as a jump-cut?** Four frames is little runway; the motion streaks are the mitigation. This is the honest visual risk of the whole project — make it a real check, not a formality.
  4. Depth: a rock passes **behind** the character's head and lands **in front of** their feet.
  5. `ring-of-fire` sustains and visibly repeats its flicker rather than playing once.
  6. The editor preview matches the game, **including the taller canvas** — the stand-in must sit three-quarters down for descents, not centred.
  7. **No existing effect changed** — spot-check several of the 379.
  8. The two sheet effects still animate unchanged.
  9. **Carry forward the open tint ruling:** the EO-idiom rework's manual pass has an unresolved blocking question about whether the quantised `tint` layer reads as an intentional flash or an ugly blob. `bolt`, `smite` and `rockfall` all author tint layers. Whatever is decided there applies here — say so explicitly.

- [ ] **Step 5:** Commit, then **superpowers:finishing-a-development-branch** for both repos (ff-merge to local `master`, delete branches, never push).

---

## Self-Review notes (for the executor)

- **Spec coverage:** per-def frame geometry + ground point (T1), anchor in eoweb (T2), non-square editor preview (T3), fourth registry layer + no matrix leak (T4), the four set pieces with three layers each (T5, T6), verification + manual pass (T7).
- **The likeliest mistake is the ground point.** `renderFrameCanvas` and `drawEffectAt` both pass `(cx, cy)` to draw functions, and for a square frame that must remain exactly `(64, 64)` — byte-identical output for all 379 existing names is the check that catches a regression here (T1 Step 7, T7 Step 2).
- **Second likeliest is the matrix leak.** Set pieces live in `KINDS` alongside the 15, so anything iterating `Object.keys(KINDS)` for matrix generation gives them 21 names each. T4 Step 2 fixes the known site; grep for others.
- **Type consistency:** `FrameGeometry`/`SQUARE_FRAME`/`TALL_FRAME` (T1) → consumed by `VfxDef.frame` everywhere, `ResolvedVfx.anchorY` (T2), the editor canvas (T3), and `SET_PIECES` (T4). `MATRIX_KINDS` and `SetPieceName` (T4) → used by T5/T6 only through `KINDS`.
- **T4 deliberately leaves four kinds throwing** `unimplemented`; T5 and T6 fill them. The check script must not call `draw`, so this is safe and the 407-name count is verifiable before any art exists.
- **The extent budget is asymmetric for tall frames** — ≤126 above the ground point, ≤62 below and either side. A measurer written for the square case will silently pass a descent that paints through the floor.
