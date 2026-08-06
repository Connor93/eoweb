# VFX Set-Piece Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authorable cycle-count axis to the three descent set pieces, drop `ring-of-fire` onto the ground, make its flames read as flames with a filled centre, and let the third boulder land.

**Architecture:** Cycles become a third generated name axis (`-x2`/`-x3`) on descents only, riding the effect-name string so nothing crosses the wire. The 20px body lift stops being inferred from `anchorY === 0.5` and becomes an explicit `FrameGeometry.bodyLift` flag, which is what lets a square *ground* effect exist.

**Tech Stack:** TypeScript, Canvas2D (`vfx-engine`), Pixi.js v8 (eoweb), Preact/React (aio-editor), tsx for headless checks.

Read the companion spec first: `eoweb/docs/superpowers/specs/2026-08-06-vfx-set-piece-tweaks-design.md`.

## Global Constraints

- **Registry must reach exactly 449 names** (379 pre-existing + 63 descents + 7 `ring-of-fire`) and **35 shapes** (unchanged). Round-trip `compose(decompose(name)) === name` must hold for all 449. **No pre-existing name may change or disappear.**
- **`ring-of-fire` gets NO cycles axis.** Only `bolt`, `smite`, `rockfall` do. `hasCycles: false` for everything else — matrix kinds, combos, specials, and `ring-of-fire`.
- **Bare name = 1 cycle.** `smite-dark` (1), `smite-dark-x2` (2), `smite-dark-x3` (3) — mirroring how base size carries no suffix.
- **`bodyLift` is the highest-risk change in this plan.** It decides whether a burst is lifted 20px. `SQUARE_FRAME` must stay `true` and `buildSheet` must set `true`, or **all 379 legacy effects and both sprite sheets shift by 20px on screen**. Verify by position, not by types.
- **The damage-sync decision is untouched.** Skills have no cast time; descents stay `frames: 4, frameMs: 100`, so the *first* cycle still completes in 400ms and the first impact still lands with the damage number. Do not change `frames` or `frameMs`.
- **Client-only.** No server, wire, or pub-format change. **Do not touch `/Users/cfraser/Projects/reoserv`** (it holds unrelated uncommitted work).
- **Determinism inviolable:** no `Math.random()`; jitter index-derived. Same `(def, frameIndex)` → identical pixels.
- **Engine stays framework-agnostic**: zero imports of Pixi/Preact/`@/` inside `src/vfx-engine/`.
- **Engine is CANONICAL IN EOWEB.** After any engine edit: `bash scripts/sync-vfx-engine.sh`, then `pnpm vfx:parity` (10 files). **Never hand-edit `aio-editor/packages/frontend/src/vfx-engine/`.**
- **`Record<string, T>` inside the engine is a cross-repo hazard** — aio-editor sets `noUncheckedIndexedAccess`, which widens such a lookup to `T | undefined` *inside the vendored engine*. Use literal-union keys. Membership tests use a `Set` of `Object.keys(...)`, never `key in obj`.
- **Extent budgets:** `TALL_FRAME` ≤62 horizontal / ≤190 above / ≤62 below the ground point. `SQUARE_FRAME`/`GROUND_FRAME` ≤62 in every direction. Measure, don't assume.
- **Gates:** eoweb → `pnpm exec tsc --noEmit`, `pnpm exec biome check <paths>`, `pnpm vfx:check`, `pnpm vfx:parity`. aio-editor → `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` (no biome, no test runner; `noUnusedLocals`/`noUnusedParameters`/`noUncheckedIndexedAccess` on).
- **Commits end with:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SwtWSvDfpcx35jqCbNXd6K
  ```
  Branch `feat/vfx-set-piece-tweaks` in each repo; ff-merge to local `master` at the end. **Never push.** Never run `git checkout --`, `git reset`, `git clean`, or `git stash` on unstaged paths.

---

## File Structure

**eoweb (canonical engine):** `src/vfx-engine/types.ts` (`bodyLift`, `GROUND_FRAME`), `registry.ts` (cycles axis), `kinds.ts` (ring + rockfall art), `scripts/vfx-registry-check.ts` (assertions).
**eoweb (render layer):** `src/render/vfx/vfx-loader.ts` (`ResolvedVfx.bodyLift`), `src/controllers/skill-vfx-controller.ts` (branch on it).
**aio-editor:** `packages/frontend/src/pubs/form/VfxField.tsx` (Cycles control). Sync-only: `packages/frontend/src/vfx-engine/*`.

**Task order:** 1 `bodyLift` → 2 cycles axis → 3 editor control → 4 ring-of-fire art → 5 rockfall + integration.

---

### Task 1: Explicit `bodyLift`, and `GROUND_FRAME`

**Files:** Modify `src/vfx-engine/types.ts`, `registry.ts`, `scripts/vfx-registry-check.ts`, `src/render/vfx/vfx-loader.ts`, `src/controllers/skill-vfx-controller.ts`.

**Interfaces (Produces):**
```ts
// types.ts — FrameGeometry gains:
bodyLift: boolean;
export const GROUND_FRAME: FrameGeometry; // 128x128, ground 64, bodyLift false
// vfx-loader.ts — ResolvedVfx gains:
bodyLift: boolean;
```

- [ ] **Step 1: Add the flag to `makeFrame` and the presets** in `types.ts`:

```ts
/** Whether this frame's burst gets the historic 20px body lift.
 *
 *  TRUE only for SQUARE_FRAME — the 379 effects that predate FrameGeometry
 *  are authored as blobs centred on the character's BODY, and the lift is
 *  what puts them there. A frame carrying its own meaningful ground point
 *  (TALL_FRAME) or an effect that belongs on the floor (GROUND_FRAME) must
 *  NOT be lifted.
 *
 *  This used to be inferred in playBurst as `anchorY === 0.5`, which is why
 *  ring-of-fire floated at chest height: it is square, so its anchorY is
 *  exactly 0.5, and it inherited a rule meant for body-centred blobs. Intent
 *  is now stated rather than guessed — and the float comparison (which only
 *  worked because 64/128 is exact in binary) is gone. */
function makeFrame(
  designW: number,
  designH: number,
  groundY: number,
  bodyLift: boolean,
): FrameGeometry { /* …existing body, plus bodyLift in the returned object… */ }

export const SQUARE_FRAME: FrameGeometry = makeFrame(128, 128, 64, true);
/** Dimensionally identical to SQUARE_FRAME; differs ONLY in bodyLift, so a
 *  square effect can sit on the ground instead of at body height. */
export const GROUND_FRAME: FrameGeometry = makeFrame(128, 128, 64, false);
export const TALL_FRAME: FrameGeometry = makeFrame(128, 256, 192, false);
```

- [ ] **Step 2: Point `ring-of-fire` at `GROUND_FRAME`** in `registry.ts`'s `SET_PIECES` (`frame: GROUND_FRAME`). Nothing else about it changes in this task.

- [ ] **Step 3: Carry `bodyLift` through `ResolvedVfx`.** In `vfx-loader.ts`, add `bodyLift: boolean`; `buildProcedural` sets `def.frame.bodyLift`. **`buildSheet` must set `bodyLift: true` in BOTH return paths** — the loaded-sheet path and the placeholder fallback after a caught `Assets.load` throw. The two sheets are body-centred and their position must not change.

- [ ] **Step 4: Branch on it in `playBurst`** (`skill-vfx-controller.ts`), replacing the `anchorY === 0.5` test:

```ts
const yy = resolved.bodyLift ? y - BURST_UP : y;
```
Update `BURST_UP`'s doc comment: it no longer keys off the anchor.

- [ ] **Step 5: Assertions** in `scripts/vfx-registry-check.ts` — the guard against a future preset inheriting the wrong anchoring:

```ts
// Assert bodyLift in BOTH directions per def. A one-sided check ("nothing
// tall is lifted") would miss the failure that actually matters: a
// pre-existing effect silently LOSING its lift and dropping 20px.
for (const name of names) {
  const f = registry[name].frame;
  const isRingOfFire = name.startsWith('ring-of-fire-');
  const isTall = f.designH !== f.designW;
  const expected = !isRingOfFire && !isTall; // only body-centred squares lift
  assert(
    f.bodyLift === expected,
    `${name}: bodyLift ${f.bodyLift}, expected ${expected}`,
  );
}
assert(SQUARE_FRAME.bodyLift === true, 'SQUARE_FRAME must keep the body lift');
assert(GROUND_FRAME.bodyLift === false, 'GROUND_FRAME must not be lifted');
assert(TALL_FRAME.bodyLift === false, 'TALL_FRAME must not be lifted');
```

- [ ] **Step 6: Prove no pre-existing effect moved.** This is the task's real gate. Write a throwaway script under `eoweb/.superpowers/` (git-ignored) that, for a broad sample of the 379 pre-existing names plus both sheet names, computes the final mount `y` both ways — old rule (`anchorY === 0.5 ? y - 20 : y`) and new rule (`bodyLift ? y - 20 : y`) — and asserts they agree. Then confirm `ring-of-fire-*` is the **only** name whose result changes, by exactly +20 (i.e. no longer lifted). Report the table. If you cannot execute it, say so plainly.

- [ ] **Step 7: Gates + sync + commit.** `pnpm vfx:check` (**407**, unchanged this task), `tsc`, `biome check --write` then `check` on `src/vfx-engine src/render/vfx src/controllers scripts`, `bash scripts/sync-vfx-engine.sh`, `pnpm vfx:parity`. Commit in both repos.

---

### Task 2: The cycles axis

**Files:** Modify `src/vfx-engine/registry.ts`, `scripts/vfx-registry-check.ts`.

**Interfaces (Produces — Task 3 codes against these):**
```ts
export type CycleKey = 1 | 2 | 3;
// VfxAxes gains:  cycles?: CycleKey;
// VfxShape gains: hasCycles: boolean;
export function composeVfxName(
  shapeId: string,
  element?: ElementKey,
  size?: SizeKey,
  cycles?: CycleKey,
): string | null;
```

- [ ] **Step 1: Add the cycles table and widen `SetPieceConfig`:**

```ts
export type CycleKey = 1 | 2 | 3;

/** [name suffix, loop count]. Bare (1 cycle) carries NO suffix, mirroring how
 *  base size does — so every existing set-piece name keeps working unchanged. */
const CYCLES: ReadonlyArray<readonly [suffix: string, loops: CycleKey]> = [
  ['', 1],
  ['x2', 2],
  ['x3', 3],
];

interface SetPieceConfig {
  frame: FrameGeometry;
  frames: number;
  loops: number;
  frameMs: number;
  /** Descents only. `ring-of-fire` is inherently sustained — a one-cycle ring
   *  of fire is not a thing anyone wants — so it keeps its fixed `loops` and
   *  offers no axis, exactly as combos offer no size. */
  hasCycles: boolean;
}
```
Set `hasCycles: true` on `bolt`/`smite`/`rockfall`, `false` on `ring-of-fire`.

- [ ] **Step 2: Generate the cycle variants** in `buildRegistry`'s set-piece loop. For a shape with `hasCycles`, iterate `CYCLES` and use the loop count as `loops`; otherwise emit one name at the config's own `loops`:

```ts
  for (const [name, cfg] of Object.entries(SET_PIECES) as [SetPieceName, SetPieceConfig][]) {
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      const variants: ReadonlyArray<readonly [string, number]> = cfg.hasCycles
        ? CYCLES
        : [['', cfg.loops]];
      for (const [suffix, loops] of variants) {
        registry[`${name}-${element}${suffix ? `-${suffix}` : ''}`] = {
          kind: name,
          ramp: ELEMENTS[element],
          sizeScale: 1,
          additive: true,
          frames: cfg.frames,
          loops,
          frameMs: cfg.frameMs,
          frame: cfg.frame,
        };
      }
    }
  }
```

- [ ] **Step 3: Mirror it in `buildIndex`,** emitting `cycles` (the numeric count) for `hasCycles` shapes and leaving it `undefined` otherwise — the same way `size` is left undefined for combos.

- [ ] **Step 4: `buildShapes` sets `hasCycles`** from the config for set pieces, and **`false` for every matrix kind, combo and special.**

- [ ] **Step 5: `composeVfxName` gains the parameter.** In the `setpiece:` branch, look the config up, and when `hasCycles` map the requested count to its suffix (defaulting to 1 when absent); when not, **ignore `cycles` entirely** and emit the bare name. `size` stays ignored for set pieces as it is today. An unknown cycle value returns `null` rather than silently falling back.

- [ ] **Step 6: Assertions:**

```ts
assert(names.length === 449, `expected 449 effects, got ${names.length}`);
assert(shapes.length === 35, `expected 35 shapes, got ${shapes.length}`);

// Descents have the axis; ring-of-fire and everything else do not.
for (const s of shapes) {
  const expected = ['setpiece:bolt', 'setpiece:smite', 'setpiece:rockfall'].includes(s.id);
  assert(s.hasCycles === expected, `${s.id}: hasCycles ${s.hasCycles}, expected ${expected}`);
}
// No cycles leak onto ring-of-fire, and no size leak onto any set piece.
for (const element of Object.keys(ELEMENTS)) {
  for (const suffix of ['x2', 'x3']) {
    assert(registry[`ring-of-fire-${element}-${suffix}`] === undefined,
      `cycles leaked onto ring-of-fire: ${element}-${suffix}`);
  }
  for (const sp of ['bolt', 'smite', 'rockfall', 'ring-of-fire']) {
    for (const suffix of ['sm', 'lg']) {
      assert(registry[`${sp}-${element}-${suffix}`] === undefined,
        `size leaked onto a set piece: ${sp}-${element}-${suffix}`);
    }
  }
}
// The loop counts actually differ, or the axis is decorative.
assert(registry['bolt-fire']?.loops === 1, 'bolt-fire must be 1 cycle');
assert(registry['bolt-fire-x2']?.loops === 2, 'bolt-fire-x2 must be 2 cycles');
assert(registry['bolt-fire-x3']?.loops === 3, 'bolt-fire-x3 must be 3 cycles');
// composeVfxName ignores the axis where absent.
assert(composeVfxName('setpiece:ring-of-fire', 'fire', undefined, 3) === 'ring-of-fire-fire',
  'cycles must be ignored for ring-of-fire');
assert(composeVfxName('setpiece:bolt', 'fire', 'lg', 2) === 'bolt-fire-x2',
  'size must be ignored, cycles honoured, for a descent');
```
The existing uniqueness and round-trip assertions must still pass across all 449.

- [ ] **Step 7: Gates + sync + commit.** `pnpm vfx:check` → **449 / 35 / round-trip OK**. aio-editor `tsc` **will fail** on `composeVfxName`'s new arity if `VfxField` passes positionally — record it; Task 3 fixes it, do not patch the editor here.

---

### Task 3: The editor Cycles control

**Files:** Modify `aio-editor/packages/frontend/src/pubs/form/VfxField.tsx`.

- [ ] **Step 1: Add the cycles order table and state,** mirroring `SIZE_ORDER`/`lastSize`:

```ts
const CYCLE_ORDER: ReadonlyArray<readonly [CycleKey, string]> = [
  [1, '1×'],
  [2, '2×'],
  [3, '3×'],
];
```
plus a `lastCycles` ref defaulting to `1`, a `hasCycles` derived from `shape?.hasCycles ?? false`, and a `pickCycles` handler that calls `emit` the way `pickSize` does.

- [ ] **Step 2: Thread `cycles` through `decompose` and `emit`.** `decompose` reads `axes.cycles` from the index; `emit` passes it as `composeVfxName`'s fourth argument. Keep the existing memory behaviour: remember the last chosen value so bouncing through a shape without the axis and back restores it.

- [ ] **Step 3: Render whichever axis the shape has, not both.** No shape has both Size and Cycles, and a greyed control wedged between two live ones reads as broken. In that row render the **Size** segmented control when `hasSize`, the **Cycles** control when `hasCycles`, and — when neither — keep today's greyed Size as the "this shape has no such axis" affordance. Reuse the existing button styling verbatim so the two controls look identical.

- [ ] **Step 4:** `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` → exit 0, no output. Commit.

**Reason through and report** what renders for: `bolt-fire` (Cycles = 1×), `bolt-fire-x3` (3×), `ring-of-fire-fire` (no Cycles control, no Size control), `nova-fire-lg` (Size = L, no Cycles), `cast-burst` (neither), and an unknown name.

---

### Task 4: Ring-of-fire art — flames and centre fill

**Files:** Modify `src/vfx-engine/kinds.ts`.

`ring-of-fire` uses `GROUND_FRAME`: design 128×128, ground point `(64, 64)`, budget **≤62 in every direction**. It is sustained (`loops: 3`), so `progress` cycles `0.125, 0.375, 0.625, 0.875` and **must loop cleanly** — 0.875 leads back into 0.125 with no visible jump.

- [ ] **Step 1: Flamier tongues.** Replace the current short strokes with tapered flame shapes: wider at the base where they meet the ring band, narrowing to a licking tip that leans outward. Give **each tongue its own index-derived phase** so they flicker independently rather than pulsing in unison — that unison pulse is what makes the current version read as a pattern rather than fire. Height should oscillate per-tongue across the four frames. Keep the far/near split: tongues at `angle >= π` belong to `behind`, the rest to `front`, matching the band.

- [ ] **Step 2: Centre fill, on `behind` only.** A quantised wash filling the ring's interior ellipse, flickering in sympathy with the tongues (same phase source, lower amplitude) so it reads as burning ground rather than a flat disc. **It must be `behind` and only `behind`** — that is what puts the character *on* the fire instead of under it. Do not add any fill to `front` or `tint`; `ring-of-fire` has no `tint` layer and must not gain one.

- [ ] **Step 3: Re-measure the extent** — all 7 elements × 4 frames × both layers, max in each direction, via a throwaway instrumented script under `eoweb/.superpowers/`. Budget ≤62 every direction. The current peak is 32, so there is room, but taller tongues consume it. Table in your report.

- [ ] **Step 4: Confirm the loop is seamless** — compare the painted output at `progress` 0.875 against 0.125 and describe the transition. A tongue at full height on the last frame dropping to zero on the first is a visible hitch.

- [ ] **Step 5:** `pnpm vfx:check` (449 / 35 / round-trip), tsc, biome, sync, parity. Commit.

---

### Task 5: Rockfall landing, integration, manual pass

**Files:** Modify `src/vfx-engine/kinds.ts`; create `docs/superpowers/plans/2026-08-06-vfx-set-piece-tweaks-manual-pass.md`.

- [ ] **Step 1: Let the third rock land.** `ROCKFALL_LAND_PROGRESS[2]` is currently `1.5` — deliberately past the sampled range so the rock stays airborne and keeps `behind` painting on the final frame. Change it to **`0.875`** so it lands on the last frame, and adjust `ROCKFALL_FALL_DURATION[2]` so its descent still reads as a fall rather than a drop (it currently has `1.5`; something near `0.5` matches the other two).

  **Replace the module comment that justifies the old value** with the corrected reasoning: once every rock has landed there is nothing behind the character, so an empty `behind` frame is *correct*, not a stutter. Say so explicitly, or the next person measuring painted pixels will "fix" it back.

- [ ] **Step 2: Verify the landing schedule.** Report, per rock, its offset above the ground point at each of the four progress values, and confirm all three reach 0. Confirm `front` is non-empty on every frame (rocks are below the cutoff once landed) and that `behind` is non-empty on frames 0–2.

- [ ] **Step 3: Full gate sweep.** eoweb `tsc`, `biome check src/vfx-engine src/render/vfx src/controllers scripts`, `pnpm vfx:check` (**449 / 35 / round-trip OK**), `pnpm vfx:parity` (10 files); aio-editor `tsc` exit 0. `git -C /Users/cfraser/Projects/reoserv status --short` → **exactly** `data/pub/npcs/0007.json`, `data/pub/skills/rage.json`, `data/pub/skills/strike.json`.

- [ ] **Step 4: Prove no pre-existing effect changed.** Rasterise a broad sample of the 379 pre-existing names at the branch point and at `HEAD` and compare pixel buffers — byte-identical. Report sample size and result.

- [ ] **Step 5: Verify every effect name you cite** by executing `buildRegistry()`. Do not pick names by eye.

- [ ] **Step 6: Write the manual-pass doc.** Read the sibling docs in that directory and match their structure. Numbered steps, **each with an explicit failure mode**. Cover:
  1. `bolt-fire-x2` and `-x3` visibly repeat, and the **first** impact still lands with the damage number.
  2. **⚠️ Does the repeat read as successive waves or as a stutter?** A rock landing and instantly reappearing at the top could look like a hitch. Judge at `-x3` specifically — this is the one thing that couldn't be predicted, and if it fails the fix is a design change, not a tweak.
  3. `ring-of-fire` now sits **on the ground**, not at chest height.
  4. Its flames read as flames — independent flicker, not a unison pulse — and it loops without a visible seam.
  5. Its centre fill is **under** the NPC, not over it.
  6. All three boulders land.
  7. **No existing effect moved.** Spot-check several `SQUARE_FRAME` effects and **both sprite sheets** — `bodyLift` is the change that could shift all of them by 20px.
  8. The editor shows a Cycles control for descents, a Size control for matrix kinds, and never both.

- [ ] **Step 7:** Commit, then **superpowers:finishing-a-development-branch** for both repos (ff-merge to local `master`, delete branches, never push).

---

## Self-Review notes (for the executor)

- **Spec coverage:** `bodyLift` + `GROUND_FRAME` (T1), cycles axis (T2), editor control (T3), ring art (T4), rockfall + verification + manual pass (T5).
- **The riskiest change is `bodyLift`,** because it silently repositions things rather than breaking a build. T1 Step 6 (old-rule vs new-rule agreement across the 379 + both sheets) is the gate; T5 Step 7 asks a human to confirm it too. `buildSheet`'s **two** return paths are the easiest miss.
- **Type consistency:** `CycleKey` (T2) → `VfxAxes.cycles`, `VfxShape.hasCycles`, `composeVfxName`'s 4th parameter, and the editor's `CYCLE_ORDER` (T3). `bodyLift` (T1) → `FrameGeometry`, `ResolvedVfx`, `playBurst`.
- **Task 2 leaves aio-editor's `tsc` red** on `composeVfxName`'s arity; T3 closes it. Called out in T2 Step 7 — do not patch the editor early.
- **`frames` and `frameMs` must not change.** Only `loops` varies with the cycles axis; altering the others would break the 400ms first-cycle guarantee the damage-sync decision rests on.
