# Expanded Skill VFX Engine + In-Editor Preview — Design

**Date:** 2026-08-05
**Repos:** eoweb (engine + Pixi loader) + aio-editor (vendored engine + preview UI)
**Status:** design approved by user; spec written for a fresh agent to execute (→ plan → subagent-driven build)

## Goal

Grow the skill-VFX palette from **3 effects to 150+** and give the AIO editor a
**live in-editor preview** so authors can browse/choose them. Built on a single
framework-agnostic **procedural VFX engine** shared by both the game (Pixi) and
the editor (Canvas2D), so the preview shows the exact effect the game renders.

## Context & current state

- Registry: `eoweb/src/render/vfx/vfx-manifest.ts` — 3 effects. `cast-burst`
  (sheet `ring-burst.png`), `fire-impact` (sheet `fire-flicker.png`),
  `buff-aura` (procedural tinted-ring fallback).
- Renderer: `eoweb/src/render/vfx/vfx-loader.ts` — real sheet sliced into frames,
  OR one hardcoded procedural generator (expanding tinted ring, 8 frames via Pixi
  `Graphics` → `renderer.generateTexture`). `ResolvedVfx { frames: Texture[];
  durationMs; additive; scale }`. `preload()` builds ALL effects at startup;
  `getFrames(ref)` is a **synchronous** cache lookup consumed by
  `SkillVfxController.playBurst` (also sync).
- Selection: skills pick effects by name via `cast_vfx`/`impact_vfx` on the pub
  (family-62 wire, already flowing). **Adding effects is client-only content —
  no server/wire/pub-format change.**
- Editor: the skills/statuses form's `cast_vfx`/`impact_vfx` fields route to
  `SuggestField` (a datalist) whose values come from `VFX_SUGGESTIONS` in
  `aio-editor/packages/frontend/src/pubs/form/suggest-values.ts` (currently the 3
  names). The editor has **no Pixi**.
- Open flag (unchanged by this work): the 2 curated CC0 sheets' license is still
  unverified (pre-deploy blocker from the earlier VFX slice). Procedural effects
  add **no** license burden (generated, CC0-clean).

This is the deferred **D14 (shared `effects` module)** + **D15 (AIO previewer)**
art sub-projects from [[Skills and status-effect framework]], finally built.

## Architecture

### The core: a framework-agnostic `vfx-engine` (Canvas2D, no Pixi, no Preact)

One module, the single source of truth, **vendored into both repos** (canonical
copy in eoweb `src/vfx-engine/`; a sync script mirrors it into aio-editor
`packages/frontend/src/vfx-engine/` with a "synced — do not edit here" header —
same pattern as the vendored icon/suggestion lists, since the two repos share no
package link). Pure TS + Canvas2D so both a Pixi wrapper and a plain `<canvas>`
can drive it.

Public surface:
- `ELEMENTS`: `Record<ElementKey, number>` — 7 tints as `0xRRGGBB`, **matching
  the combat-element colors** (`eoweb/src/combat-overlay/element-colors.ts`):
  `neutral 0xfff8e1, fire 0xfb923c, water 0x60a5fa, earth 0x84cc16, wind 0xfacc15,
  light 0xfde047, dark 0xa855f7`. (Engine defines its own copy so it stays
  dependency-free; keep it matching the combat palette.)
- `VfxDef`: `{ kind: ShapeKind; color: number; sizeScale: number; durationMs:
  number; additive: boolean; frames: number; combo?: ShapeKind }` (the resolved
  params for one effect; `combo` = a second kind composited on top).
- `SHAPE_KINDS`: for each kind, a `drawFrame(ctx: CanvasRenderingContext2D,
  progress: number /*0..1*/, def: VfxDef, cx: number, cy: number)` that paints one
  frame centered at (cx,cy) on a fixed **128×128** canvas. ~15 kinds: `ring, disc,
  spark-burst, slash, spiral, sparkle, nova, shockwave, beam-pop, implode, vortex,
  rain, chains, orbit, burst-lines`.
- `buildRegistry(): Record<string, VfxDef>` — **generates** the whole palette
  (see Content matrix). Never hand-authored.
- `renderFrameCanvas(def, frameIndex): HTMLCanvasElement` — draws frame `i` of `def`
  to an offscreen 128×128 canvas (used by the eoweb Pixi wrapper).
- `drawEffectAt(ctx, def, progress, cx, cy)` — draws the current progress frame
  (used by the editor's live `<canvas>` rAF loop).

### Content matrix (how `buildRegistry` produces 150+)

- **Kinds (15)** × **Elements (7)** × **Sizes (3: `sm`=0.6, base=1.0, `lg`=1.5)**
  = **315** matrix effects.
- **Naming:** `<kind>-<element>[-<size>]`; base size omits the suffix; every
  element is explicit (incl. `neutral`). Examples: `ring-fire`, `ring-fire-lg`,
  `slash-dark-sm`, `nova-neutral`.
- **Combos (~8, curated):** a second kind composited over the first, e.g.
  `nova-sparkle-<element>`, `ring-slash-<element>` — a hand-picked short list ×
  elements (NOT every pair — that's thousands). Name: `<kindA>-<kindB>-<element>`.
- **Role specials (~8, fixed params, no element loop):** `heal-glow`,
  `buff-aura` (keep existing name), `debuff-sink`, `shield-flash`, `cast-arcane`,
  `level-up`, `crit-flash`, `stun-stars`.
- **Kept curated sheets (2):** `cast-burst`, `fire-impact` stay sheet-backed in
  the eoweb manifest (NOT generated) — the engine registry merges with them.

Total ≈ **350+ named effects.** Kinds/sizes/combos are the knobs — adding one
kind auto-adds ~21 effects. If the count feels unwieldy, trim the kind or size
list; the generation stays the same.

Per-role default params (durationMs, additive, frames) live on each kind's
config in the engine; impacts ~350ms/12 frames, auras loop ~700ms, casts ~450ms.

### eoweb integration (`vfx-loader.ts` + `client.ts`)

- The loader's registry = the 2 sheet-backed manifest entries **merged with**
  `buildRegistry()` from the engine.
- **Procedural build path (new):** for an engine def, draw each of `def.frames`
  frames via `renderFrameCanvas(def, i)` → `Texture.from(canvas)` (Pixi v8) →
  `ResolvedVfx`. This replaces the single hardcoded Pixi-`Graphics` ring.
- **Lazy build (load-bearing decision #2):** with 350 effects, do NOT build all at
  preload. Change `getFrames(ref)`: on a cache miss, if the ref is an engine
  (procedural) def, **build it synchronously right there** and cache it (Canvas2D
  draw + `Texture.from` are sync in Pixi v8), then return it — so `playBurst`
  stays synchronous and only pays for effects actually used. `preload()` now only
  async-loads the 2 sheet-backed effects (their `Assets.load` is async).
- Existing names (`cast-burst`, `fire-impact`, `buff-aura`) keep working;
  `buff-aura` becomes an engine special (or stays procedural — either, as long as
  the name resolves).

### AIO editor preview (D15) + suggestions

- Vendor the engine into `aio-editor/.../src/vfx-engine/` via the sync script.
- Regenerate `VFX_SUGGESTIONS` from `Object.keys(buildRegistry())` + the 2 sheet
  names, sorted (groups by `impact-*`, `slash-*`, … prefix in the datalist).
- **Preview component:** a small `<canvas>` (128×128) + a ▶/⏸ control shown next
  to the `cast_vfx`/`impact_vfx` `SuggestField` (gate on the field path ending in
  `_vfx`). It resolves the current field value → `buildRegistry()[value]` (or a
  sheet name → a static note) and plays it via `drawEffectAt` in a
  `requestAnimationFrame` loop (progress = `(now-start)/durationMs % 1`). Unknown
  value → a muted "no preview" state. No Pixi.

## What stays untouched
No server, no wire, no pub-format change. The skills/statuses schema's
`x-aio-suggest` marker already routes `cast_vfx`/`impact_vfx` to the datalist.
Existing effect names preserved. The two curated sheets + their license flag are
unchanged.

## Testing (both repos: `tsc --noEmit` gates; no unit-test runner)
- **Engine (tsx/node check):** `buildRegistry()` yields ≥150 unique names, no
  collisions, every def has a valid `kind`/`color`/`sizeScale`/`frames`>0, every
  combo's two kinds exist, every special resolves. (Rendering itself needs a
  canvas — verified in the manual pass, not the headless check.)
- **eoweb:** `tsc` clean; manual — cast a skill authored with a new effect (e.g.
  `impact-water-lg`), confirm it renders on the target; the 3 legacy names still
  render; startup isn't slowed (lazy build).
- **aio-editor:** `tsc` clean; `VFX_SUGGESTIONS.length` === registry+sheets count;
  manual — the preview canvas animates the selected effect and matches in-game.
- **Cross-repo parity:** a check that the vendored engine copy is byte-identical
  to eoweb's canonical (the sync script's job) so editor preview === game render.

## Drift / gotchas (carry into the plan + gotchas note)
- The engine is **vendored into two repos** — edits go to the eoweb canonical
  ONLY, then `sync` to aio-editor; the aio-editor copy carries a "do not edit"
  header. A parity check guards drift.
- Engine `ELEMENTS` duplicates the combat-element palette (kept matching) — if
  combat colors change, update the engine.
- Lazy build must stay **synchronous** for procedural defs (Pixi `Texture.from`
  on a canvas is sync) so `playBurst` never awaits; only sheet effects are async
  (preloaded).
- 128×128 frame canvas is the fixed working size; `sizeScale` scales the drawing
  within it; `SkillBurst`'s own `scale` still applies on top.

## Scope / YAGNI
- **In:** the shared Canvas2D engine (15 kinds × 7 elements × 3 sizes + ~8 combos
  + ~8 specials), eoweb lazy loader rework, aio-editor vendored engine + regenerated
  suggestions + live preview canvas.
- **Out:** sound (SFX = separate D13); more curated CC0 sheets (procedural only
  this pass); per-effect hand-tuning beyond per-kind defaults; a full effect
  *editor* (authors pick from the generated palette, they don't design new kinds
  in-app); resolving the existing sheets' license flag (unchanged).
