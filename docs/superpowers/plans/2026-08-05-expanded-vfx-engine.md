# Expanded Skill VFX Engine + In-Editor Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Grow skill VFX from 3 to 150+ effects via a shared framework-agnostic procedural engine, rework the eoweb Pixi loader to use it (lazy), and add a live VFX preview to the AIO editor.

**Architecture:** A pure-TS + Canvas2D `vfx-engine` (no Pixi/Preact) is the single source of truth, vendored into both repos. eoweb wraps its Canvas2D frames into Pixi `Texture`s (built lazily on first cast); the AIO editor plays them directly in a `<canvas>`. Read the companion spec first: `eoweb/docs/superpowers/specs/2026-08-05-expanded-vfx-engine-design.md` — it has the full content matrix, element palette, and load-bearing decisions.

**Tech Stack:** TypeScript, Canvas2D, Pixi.js v8.18 (`Texture.from(canvas)`), Preact (editor preview). tsx/node for tests.

## Global Constraints

- **The `vfx-engine` is framework-agnostic** — Canvas2D only, ZERO imports of Pixi, Preact, or any repo-specific module. This is what lets it vendor into both repos. Enforce by keeping `src/vfx-engine/` self-contained.
- **Element palette matches combat colors** (`eoweb/src/combat-overlay/element-colors.ts`), as `0xRRGGBB`: `neutral 0xfff8e1, fire 0xfb923c, water 0x60a5fa, earth 0x84cc16, wind 0xfacc15, light 0xfde047, dark 0xa855f7`.
- **Client-only.** No server/wire/pub-format change — `cast_vfx`/`impact_vfx` are already free-form strings. Do NOT touch reoserv.
- **Lazy build stays SYNCHRONOUS** for procedural effects (Canvas2D draw + Pixi `Texture.from(canvas)` are sync), so `SkillVfxController.playBurst` never awaits. Only the 2 sheet-backed effects (`cast-burst`, `fire-impact`) use async `Assets.load` (preloaded).
- **Fixed 128×128 frame canvas.** `drawFrame` paints centered at (cx,cy); `def.sizeScale` scales within; `SkillBurst.scale` still applies on top.
- **Engine is vendored, canonical in eoweb.** aio-editor's copy is synced (not hand-edited) and carries a "SYNCED FROM eoweb — do not edit here" header. A parity check guards drift.
- **Existing effect names preserved:** `cast-burst`, `fire-impact` (sheets), `buff-aura` must still resolve and render.
- **Gates:** eoweb → `pnpm exec tsc --noEmit` + `pnpm exec biome check <files>` (eoweb HAS biome; run `biome check --write` before commit). aio-editor → `npx tsc -p tsconfig.json --noEmit` (NO biome). No unit-test runner in either — tests are tsx/node scripts + documented manual passes.
- **Commits end with:**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MCJuyPiZcSDg2NY62uykWA
  ```
  Start on a feature branch in each repo (e.g. `feat/expanded-vfx`); ff-merge to local master at the end (local-only, never push). NEVER touch reoserv's WIP.

---

## File Structure

**eoweb (canonical engine + Pixi loader):**
- Create: `src/vfx-engine/palette.ts` (ELEMENTS), `src/vfx-engine/types.ts` (VfxDef, ShapeKind), `src/vfx-engine/kinds.ts` (the 15 drawFrame functions + per-kind config), `src/vfx-engine/registry.ts` (buildRegistry), `src/vfx-engine/render.ts` (renderFrameCanvas, drawEffectAt), `src/vfx-engine/index.ts` (barrel).
- Modify: `src/render/vfx/vfx-loader.ts` (consume engine, lazy build), `src/render/vfx/vfx-manifest.ts` (keep the 2 sheets; merge engine registry), `src/client/client.ts` (preload only sheets).
- Create: `scripts/vfx-registry-check.mjs` (headless registry assertions), `scripts/sync-vfx-engine.sh` (copies `src/vfx-engine/` → aio-editor).

**aio-editor (vendored engine + preview):**
- Create (via sync): `packages/frontend/src/vfx-engine/*` (mirror; do-not-edit header).
- Modify: `packages/frontend/src/pubs/form/suggest-values.ts` (regenerate VFX_SUGGESTIONS from the engine), `packages/frontend/src/pubs/form/fields.tsx` (attach the preview to the vfx SuggestField).
- Create: `packages/frontend/src/pubs/form/VfxPreview.tsx` (the `<canvas>` + rAF player).

**Task order:** 1 engine-core+3-kinds → 2 remaining-12-kinds → 3 eoweb-loader → 4 vendor+sync+suggestions → 5 editor-preview → 6 integration+parity+manual. Tasks 1-3 + the check are eoweb; 4-5 aio-editor; 6 cross-repo.

---

### Task 1: `vfx-engine` core — types, palette, registry, dispatchers + 3 seed kinds

**Files (eoweb):** Create `src/vfx-engine/{palette,types,kinds,registry,render,index}.ts` + `scripts/vfx-registry-check.mjs`.

**Interfaces (Produces — later tasks depend on these EXACT shapes):**
```ts
// palette.ts
export type ElementKey = 'neutral'|'fire'|'water'|'earth'|'wind'|'light'|'dark';
export const ELEMENTS: Record<ElementKey, number> = {
  neutral: 0xfff8e1, fire: 0xfb923c, water: 0x60a5fa, earth: 0x84cc16,
  wind: 0xfacc15, light: 0xfde047, dark: 0xa855f7,
};

// types.ts
export type ShapeKind = 'ring'|'disc'|'spark-burst'|'slash'|'spiral'|'sparkle'
  |'nova'|'shockwave'|'beam-pop'|'implode'|'vortex'|'rain'|'chains'|'orbit'|'burst-lines';
export interface VfxDef {
  kind: ShapeKind;
  color: number;         // 0xRRGGBB
  sizeScale: number;     // 0.6 sm / 1.0 base / 1.5 lg
  durationMs: number;
  additive: boolean;
  frames: number;        // discrete frames eoweb rasterizes (e.g. 12)
  combo?: ShapeKind;     // optional second kind composited on top
}
export const FRAME_SIZE = 128; // px, fixed working canvas

// kinds.ts — per-kind visual + default params
export interface KindConfig { durationMs: number; frames: number; additive: boolean;
  draw(ctx: CanvasRenderingContext2D, progress: number, def: VfxDef, cx: number, cy: number): void; }
export const KINDS: Record<ShapeKind, KindConfig>;

// registry.ts
export function buildRegistry(): Record<string, VfxDef>;

// render.ts
export function renderFrameCanvas(def: VfxDef, frameIndex: number): HTMLCanvasElement; // 128×128
export function drawEffectAt(ctx: CanvasRenderingContext2D, def: VfxDef, progress: number, cx: number, cy: number): void;
```

- [ ] **Step 1: palette.ts + types.ts** — exactly as above.

- [ ] **Step 2: registry.ts — the generative palette.** `buildRegistry` produces the full name→def map:
  - Matrix: for each `kind` in `Object.keys(KINDS)`, each `element` in `ELEMENTS`, each size `['sm','','lg']` (scale 0.6/1.0/1.5): name = `` `${kind}-${element}${size?'-'+size:''}` ``; def = `{kind, color: ELEMENTS[element], sizeScale, durationMs: KINDS[kind].durationMs, additive: KINDS[kind].additive, frames: KINDS[kind].frames}`.
  - Combos (curated array of `[kindA, kindB]` pairs — pick ~8: `['nova','sparkle'],['ring','slash'],['disc','spark-burst'],['shockwave','sparkle'],['spiral','sparkle'],['implode','ring'],['nova','burst-lines'],['orbit','sparkle']`): for each pair × each element: name `` `${a}-${b}-${element}` ``, def base = kindA's def at base size with `combo: b`.
  - Specials (fixed): `heal-glow`(kind disc, light-green 0x86efac, long), `buff-aura`(kind ring, 0xffcc44, loop 700ms), `debuff-sink`(kind implode, 0xa855f7), `shield-flash`(kind shockwave, 0x93c5fd), `cast-arcane`(kind spiral, 0xc4b5fd), `level-up`(kind beam-pop, 0xfde047), `crit-flash`(kind nova, 0xffffff, short), `stun-stars`(kind orbit, 0xfde047). Give each explicit `{kind,color,sizeScale:1,durationMs,additive:true,frames}`.
  - Return the merged object. (Note: `cast-burst`/`fire-impact` are NOT here — they're sheet-backed in the eoweb manifest; the loader merges them.)

- [ ] **Step 3: render.ts dispatchers.** `renderFrameCanvas(def,i)`: make a 128×128 `document.createElement('canvas')`, get 2d ctx, call `KINDS[def.kind].draw(ctx, i/(def.frames-1), def, 64, 64)`; if `def.combo` also `KINDS[def.combo].draw(...)`; return canvas. `drawEffectAt(ctx,def,progress,cx,cy)`: clear region, `KINDS[def.kind].draw(ctx,progress,def,cx,cy)` (+ combo). Both use `additive` by setting `ctx.globalCompositeOperation = def.additive ? 'lighter' : 'source-over'`.

- [ ] **Step 4: kinds.ts with 3 SEED kinds fully implemented** (`ring`, `disc`, `spark-burst`) as the drawing pattern; stub the other 12 with a `throw new Error('unimplemented: <kind>')` draw (Task 2 fills them) BUT register all 15 in `KINDS` with their config so `buildRegistry` generates the full palette now. Seed examples (colors via `#${def.color.toString(16).padStart(6,'0')}`; use `def.color` for stroke/fill, alpha fades with progress):
  - `ring`: expanding hollow circle, radius `p*48*sizeScale`, `lineWidth 3`, `globalAlpha 1-p`, stroke.
  - `disc`: filled circle radius `p*44*sizeScale`, `globalAlpha 0.6*(1-p)`, fill; plus a brighter core ring.
  - `spark-burst`: N=14 radial line segments from center outward, each length `p*46*sizeScale`, from inner `0.2*len` to outer, `globalAlpha 1-p`, slight per-spark angle jitter (deterministic from index, e.g. `i*2.399`).
  - Config for all 15 (durationMs/frames/additive): impacts (`ring,disc,spark-burst,slash,nova,shockwave,implode,burst-lines`) ~350ms/12/true; `sparkle,spiral,vortex,orbit,chains,rain,beam-pop` ~500ms/14/true.

- [ ] **Step 5: index.ts barrel** re-exporting palette/types/kinds/registry/render.

- [ ] **Step 6: headless registry check.** `scripts/vfx-registry-check.mjs` (node ESM — import from the built TS via tsx: `npx tsx scripts/vfx-registry-check.mjs` OR make it `.ts` and run with tsx). Assert: `buildRegistry()` has ≥150 keys, all unique, every def has a `kind` in the 15, `frames>0`, `sizeScale>0`, every `combo` (if set) is a valid kind, the 8 specials are present. Print `vfx-registry: N effects, checks passed`. It must NOT call draw/renderFrameCanvas (no DOM canvas headless). Add a package.json script `"vfx:check": "tsx scripts/vfx-registry-check.ts"`.

- [ ] **Step 7:** Run `pnpm vfx:check` (≥150, passes), `pnpm exec tsc --noEmit` (clean), `pnpm exec biome check --write src/vfx-engine scripts/vfx-registry-check.ts` then `biome check` clean. Commit.

---

### Task 2: The remaining 12 `drawFrame` kinds

**Files (eoweb):** Modify `src/vfx-engine/kinds.ts` (replace the 12 stubs with real draws).

**Interfaces:** Consumes the `KindConfig.draw` signature + `VfxDef` from Task 1. Produces no new API (only fills draw bodies) — `buildRegistry` output is unchanged (same names).

Implement each to its 1-line spec (creative Canvas2D; use `def.color`, `progress`, `sizeScale`, deterministic index-based jitter — NO Math.random, it breaks determinism):
- [ ] `slash`: a curved arc swipe — an arc stroke sweeping angle `-0.6π→0.6π` as progress advances, thick tapering `lineWidth`, `globalAlpha 1-p`.
- [ ] `spiral`: a spiral polyline from center outward, `theta = p*6π`, `r = p*46*scale`, stroke with fading alpha.
- [ ] `sparkle`: ~10 small 4-point star twinkles at fixed scattered offsets, each scaling up then down over `p` (phase-offset per index), additive.
- [ ] `nova`: a bright filled flash (radial gradient white→color, alpha `1-p`) + an expanding thin ring — the "big pop".
- [ ] `shockwave`: a flat ground ellipse (squashed vertically ~0.5) expanding ring — reads as a ground wave.
- [ ] `beam-pop`: a vertical pillar — a tall thin rect/gradient rising from cy, `height p*80*scale`, fading.
- [ ] `implode`: reverse of ring — particles/ring converging INWARD (radius `(1-p)*48*scale`), good for debuffs.
- [ ] `vortex`: several curved arcs rotating around center, angle offset by `p*4π`, radius pulsing.
- [ ] `rain`: ~12 short vertical streaks falling (y advances with p), staggered by index, fading at bottom.
- [ ] `chains`: 2-3 zigzag polylines radiating from center (lightning-like), jittered by index, alpha flicker via `p`.
- [ ] `orbit`: ~5 dots circling center at `theta = p*2π + i*2π/5`, radius `40*scale`, small filled circles (good for stun-stars).
- [ ] `burst-lines`: manga-style straight lines radiating from center, N=16, length pulsing with `p`, thin.

- [ ] Run `pnpm exec tsc --noEmit` clean + `biome check --write` + verify `pnpm vfx:check` still passes (registry unchanged). (Actual rendering verified in Task 6 manual pass + the editor preview.) Commit.

---

### Task 3: eoweb `vfx-loader` rework — consume engine, lazy build

**Files (eoweb):** Modify `src/render/vfx/vfx-loader.ts`, `src/render/vfx/vfx-manifest.ts`, `src/client/client.ts`.

**Interfaces:** Consumes `buildRegistry`, `renderFrameCanvas`, `VfxDef`, `FRAME_SIZE` from `@/vfx-engine`. Preserves `ResolvedVfx` + `getFrames(ref): ResolvedVfx | null` (sync) + `playBurst` contract.

- [ ] **Step 1: manifest** — keep the 2 sheet entries (`cast-burst`, `fire-impact`) in `vfx-manifest.ts` (`SHEETS: Record<string, VfxDef-with-sheet>`). Remove `buff-aura` from the manifest (it becomes an engine special).
- [ ] **Step 2: loader** — the registry the loader resolves against = `{...SHEETS-as-refs, ...buildRegistry()}` (engine defs win only if no sheet). `build` for a sheet ref stays async (`Assets.load`). Add `buildProcedural(def: engine VfxDef): ResolvedVfx` — for `i in def.frames`: `Texture.from(renderFrameCanvas(def, i))`; `{frames, durationMs: def.durationMs, additive: def.additive, scale: def.sizeScale}`. (Verify Pixi v8 `Texture.from(HTMLCanvasElement)` returns a usable texture; if it needs `{resource: canvas}` shape, adapt.)
- [ ] **Step 3: lazy `getFrames`** — on cache miss: if the ref is a sheet name, return null (sheets are preloaded; a miss = not loaded yet); if it's an engine def (in `buildRegistry()`), `buildProcedural` it synchronously, cache, return. Keep returning null for unknown refs.
- [ ] **Step 4: `preload`** — now only iterates the 2 SHEETS (async `Assets.load`); procedural effects are NOT preloaded. `client.ts:501 void this.vfxLoader.preload()` stays (just does less).
- [ ] **Step 5:** `tsc` clean + `biome check --write` clean. Manual note for Task 6: author a test skill with `cast_vfx: "cast-arcane"` + `impact_vfx: "impact-water-lg"` and confirm they render in-game; legacy `cast-burst`/`fire-impact`/`buff-aura` still render; no startup slowdown. Commit.

---

### Task 4: Vendor the engine into aio-editor + sync script + regenerate suggestions

**Files:** Create `eoweb/scripts/sync-vfx-engine.sh`; sync-create `aio-editor/packages/frontend/src/vfx-engine/*`; modify `aio-editor/packages/frontend/src/pubs/form/suggest-values.ts`.

- [ ] **Step 1: sync script** (`eoweb/scripts/sync-vfx-engine.sh`) — copies `eoweb/src/vfx-engine/*.ts` → `aio-editor/packages/frontend/src/vfx-engine/`, prepending a header comment `// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh` to each file. Idempotent. Run it.
- [ ] **Step 2: regenerate `VFX_SUGGESTIONS`** — in aio-editor `suggest-values.ts`, replace the hardcoded 3-item `VFX_SUGGESTIONS` with `[...Object.keys(buildRegistry()), 'cast-burst', 'fire-impact'].sort()` (import `buildRegistry` from `@/vfx-engine` or the relative path). Keep `ICON_SUGGESTIONS` unchanged.
- [ ] **Step 3:** `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` clean (the vendored engine is framework-agnostic so it compiles under the frontend tsconfig). Confirm `VFX_SUGGESTIONS.length` ≥ 150 (log it once). Commit (aio-editor).

---

### Task 5: AIO editor VFX preview component

**Files (aio-editor):** Create `packages/frontend/src/pubs/form/VfxPreview.tsx`; modify `packages/frontend/src/pubs/form/fields.tsx` (render it under the vfx `SuggestField`).

- [ ] **Step 1: `VfxPreview.tsx`** — props `{ value: string }`. A 128×128 `<canvas>` (ref) + a ▶/⏸ toggle. On play: resolve `def = buildRegistry()[value]` (from `@/vfx-engine`); if none (a sheet name like `cast-burst`, or unknown) show a muted "no preview (sheet/unknown)" state. rAF loop: `progress = ((now - start) / def.durationMs) % 1`; `ctx.clearRect(0,0,128,128); drawEffectAt(ctx, def, progress, 64, 64)`. Cancel rAF on unmount / pause / value change. Use a subtle dark checkered/neutral background so additive effects are visible.
- [ ] **Step 2: wire into `SuggestField`** — in `fields.tsx`, when the field path ends with `cast_vfx` or `impact_vfx` (reuse the same suffix check `SuggestField` already uses for `suggestionsForPath`), render `<VfxPreview value={String(value ?? '')} />` beneath the input. (icon_id fields do NOT get a preview.)
- [ ] **Step 3:** `npx tsc -p tsconfig.json --noEmit` clean. Manual (Task 6): open a skill's `cast_vfx` field → preview animates the selected effect; switching the datalist value updates it; a sheet name shows the muted state. Commit.

---

### Task 6: Integration — cross-repo parity + manual pass

**Files:** Create `eoweb/scripts/check-vfx-parity` (or inline) — asserts the vendored aio-editor engine matches eoweb's canonical.

- [ ] **Step 1: parity check** — a small script (or a step in `sync-vfx-engine.sh --check`) that diffs each `eoweb/src/vfx-engine/*.ts` against `aio-editor/.../src/vfx-engine/*.ts` **ignoring the synced header line** — fails if any body differs (drift). Run it; must pass right after a sync.
- [ ] **Step 2: registry parity** — confirm `buildRegistry()` keys are identical in both repos (same engine → tautological after sync, but assert the counts match and log the total).
- [ ] **Step 3: documented manual pass** (needs both dev stacks + a browser — the human/controller runs this, not a headless subagent):
  1. **eoweb:** author (or temporarily edit) a skill pub with `cast_vfx: "cast-arcane"`, `impact_vfx: "impact-water-lg"`; cast it → both render on caster/target; try 3-4 more (a slash, a nova, a combo like `nova-sparkle-fire`, a special `heal-glow`). Legacy `cast-burst`/`fire-impact`/`buff-aura` still render. Startup not visibly slower (lazy build).
  2. **aio-editor:** open a skill in the form → `cast_vfx`/`impact_vfx` datalist lists the full palette; the **preview canvas** animates the selected effect and visually **matches** the in-game render; a sheet name (`cast-burst`) shows the muted state; `items`/`npcs` forms unaffected.
- [ ] **Step 4:** commit any fixes. Then finishing-a-development-branch in BOTH repos (ff-merge to local master, no push).

---

## Self-Review notes (for the executor)
- **Spec coverage:** engine (kinds/elements/sizes/combos/specials + naming), eoweb lazy loader, vendored sync, regenerated suggestions, preview — all have tasks. The two load-bearing decisions (Canvas2D shared engine; synchronous lazy build) are in Tasks 1 & 3.
- **Determinism:** drawFrame must NOT use `Math.random()` (would flicker frame-to-frame and differ between eoweb rasterization and editor rAF) — derive all jitter from the particle index.
- **The drawFrame bodies (Tasks 1-2) are creative rendering code** guided by per-kind specs — the reviewer judges "does it render a recognizable <kind> in `def.color`, fade over progress, respect sizeScale, and stay deterministic," not pixel-exactness.
- **Cross-repo:** engine edits go to eoweb ONLY → sync → parity check. The aio-editor copy is generated. Record the vendoring + the "engine ELEMENTS mirrors combat colors" drift on the [[Eoweb]]/[[AIO Editor]] gotchas notes.
- **Pre-flight risk:** verify Pixi v8.18 `Texture.from(canvas)` early in Task 3 (the whole procedural path depends on it) — if the API differs, adapt before building all of Task 3.
