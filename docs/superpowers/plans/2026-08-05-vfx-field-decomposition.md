# VFX Field Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AIO editor's flat 381-entry VFX datalist with three orthogonal pickers — Shape × Element × Size — that compose into the same stored effect-name string, with the live preview following the selection.

**Architecture:** The `vfx-engine` (canonical in eoweb, script-vendored into aio-editor) gains a structured index alongside `buildRegistry()` — it already knows every name's axes at generation time and currently discards them. The editor reads that structure and **never parses effect names**. A new `VfxField` component owns the three controls; `fields.tsx` keeps owning label chrome and routing.

**Tech Stack:** TypeScript, Canvas2D (`vfx-engine`), Preact/React (aio-editor form), tsx for the headless engine checks.

Read the companion spec first: `eoweb/docs/superpowers/specs/2026-08-05-vfx-field-decomposition-design.md`.

## Global Constraints

- **Client-only, UI-only.** The stored pub value stays the single composite string (`nova-fire-lg`) — it is the family-62 wire contract and the engine's registry key. **NO reoserv change, NO wire change, NO pub-schema change.** Do not touch `/Users/cfraser/Projects/reoserv` (it holds unrelated uncommitted WIP).
- **The `vfx-engine` is framework-agnostic:** zero imports of Pixi, Preact, or any repo-specific/`@/` module inside `src/vfx-engine/`. It is copied verbatim into another repository.
- **The engine is CANONICAL IN EOWEB.** Never hand-edit `aio-editor/packages/frontend/src/vfx-engine/`. Edit eoweb, then `bash scripts/sync-vfx-engine.sh`, then `pnpm vfx:parity`.
- **`buildRegistry()` output must not change** — the same **379** names with the same defs. This work only *adds* API.
- **Never use `key in obj` or `obj[key]` for membership against a plain object literal** when the key could be arbitrary. `ELEMENTS`, `KINDS` and `SPECIALS` are plain literals, so `'constructor' in ELEMENTS` is `true`. Use a `Set` of `Object.keys(...)` (the pattern already in `scripts/vfx-registry-check.ts`). `Object.hasOwn` is NOT available — eoweb's tsconfig targets ES2020.
- **Empty string is a meaningful value** ("no VFX" — reoserv defaults both fields to `String::new()`). The Shape picker needs an explicit `None` that emits `""`.
- **Gates:** eoweb → `pnpm exec tsc --noEmit`, `pnpm exec biome check <paths>`, `pnpm vfx:check`, `pnpm vfx:parity`. aio-editor → `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` (**no biome, no unit-test runner** — `tsc` is the gate). aio-editor's tsconfig sets `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`; write to that bar.
- **Commits end with:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SwtWSvDfpcx35jqCbNXd6K
  ```
  Work on a `feat/vfx-field-decomposition` branch in each repo; ff-merge to local `master` at the end. **Never push.** Never run `git checkout --`, `git reset`, `git clean`, or `git stash` on unstaged paths.

---

## File Structure

**eoweb (canonical engine):**
- Modify: `src/vfx-engine/registry.ts` — export `SIZES`/`COMBOS`/`SPECIALS`; add `VfxLayer`, `SizeKey`, `VfxAxes`, `VfxShape`, `buildIndex()`, `buildShapes()`, `composeVfxName()`.
- Modify: `scripts/vfx-registry-check.ts` — assertions for the new API (the round-trip property is the load-bearing one).
- Re-sync only: `aio-editor/packages/frontend/src/vfx-engine/*` (generated).

**aio-editor (the UI):**
- Create: `packages/frontend/src/pubs/form/VfxField.tsx` — the three controls + preview + raw toggle. Owns *only* the controls; no label chrome.
- Modify: `packages/frontend/src/pubs/form/fields.tsx` — route vfx paths to the new field; remove the now-dead `VfxPreview` call inside `SuggestField`.

**Task order:** 1 engine API (+sync) → 2 editor field → 3 integration + manual pass doc.

---

### Task 1: Engine structured index — axes, shapes, compose

**Files:**
- Modify: `eoweb/src/vfx-engine/registry.ts`
- Modify: `eoweb/scripts/vfx-registry-check.ts`
- Re-sync (do not hand-edit): `aio-editor/packages/frontend/src/vfx-engine/*`

**Interfaces:**
- Consumes: existing `KINDS` (`./kinds`), `ELEMENTS`/`ElementKey` (`./palette`), `ShapeKind`/`VfxDef` (`./types`).
- Produces — Task 2 codes against these EXACT shapes:
  ```ts
  export type VfxLayer = 'matrix' | 'combo' | 'special';
  export type SizeKey = 'sm' | 'base' | 'lg';

  export interface VfxAxes {
    layer: VfxLayer;
    kind: ShapeKind;
    combo?: ShapeKind;      // combo layer only
    element?: ElementKey;   // matrix + combo only
    size?: SizeKey;         // matrix only
    shapeId: string;
  }

  export interface VfxShape {
    id: string;             // 'kind:nova' | 'combo:nova+sparkle' | 'special:heal-glow'
    label: string;          // 'Nova' | 'Nova + Sparkle' | 'Heal Glow'
    layer: VfxLayer;
    hasElement: boolean;
    hasSize: boolean;
  }

  export function buildIndex(): Record<string, VfxAxes>;   // same 379 keys as buildRegistry()
  export function buildShapes(): VfxShape[];               // 31 entries
  export function composeVfxName(
    shapeId: string, element?: ElementKey, size?: SizeKey,
  ): string | null;
  ```

**⚠️ `SizeKey` is NOT the name suffix.** The registry generates base-size names with an *empty* suffix (`nova-fire`, never `nova-fire-base`). `'base'` is a UI token only and must never reach a generated name. Step 1 restructures `SIZES` to carry key and suffix separately.

- [ ] **Step 1: Restructure `SIZES` and export the three private constants.**

In `src/vfx-engine/registry.ts`, replace the existing `SIZES` declaration with a 3-tuple carrying the UI key, the name suffix, and the scale, and add `export` to `SIZES`, `COMBOS` and `SPECIALS`:

```ts
export type VfxLayer = 'matrix' | 'combo' | 'special';
export type SizeKey = 'sm' | 'base' | 'lg';

// [UI key, NAME SUFFIX, sizeScale]. The suffix is '' at base size — the
// generated name is `nova-fire`, never `nova-fire-base`. Keep these distinct:
// 'base' is unusable as a name suffix and '' is unusable as a UI key.
export const SIZES: ReadonlyArray<
  readonly [key: SizeKey, suffix: string, sizeScale: number]
> = [
  ['sm', 'sm', 0.6],
  ['base', '', 1.0],
  ['lg', 'lg', 1.5],
];
```

Then add `export` to the existing `COMBOS` and `SPECIALS` declarations (leave their contents untouched).

- [ ] **Step 2: Update the matrix loop to the new `SIZES` shape.**

In `buildRegistry()`, the matrix loop currently destructures `[sizeLabel, sizeScale]`. Change it to skip the new middle element correctly:

```ts
      for (const [, suffix, sizeScale] of SIZES) {
        const name = `${kind}-${element}${suffix ? `-${suffix}` : ''}`;
        registry[name] = {
          kind,
          color: ELEMENTS[element],
          sizeScale,
          durationMs: config.durationMs,
          additive: config.additive,
          frames: config.frames,
        };
      }
```

- [ ] **Step 3: Run `pnpm vfx:check` to confirm the refactor changed nothing.**

Run: `pnpm vfx:check`
Expected: `vfx-registry: 379 effects, checks passed` — identical to before. If the count moved, the `SIZES` destructuring is wrong.

- [ ] **Step 4: Add the shape-id/label helpers and membership sets.**

Append to `src/vfx-engine/registry.ts`:

```ts
// Membership sets, NOT `key in obj`. KINDS/ELEMENTS/SPECIALS are plain object
// literals, so `'constructor' in ELEMENTS` is true and would let a prototype
// key compose a bogus name. (Object.hasOwn is unavailable — tsconfig is ES2020.)
const KIND_KEYS: ReadonlySet<string> = new Set(Object.keys(KINDS));
const ELEMENT_KEYS: ReadonlySet<string> = new Set(Object.keys(ELEMENTS));
const SPECIAL_KEYS: ReadonlySet<string> = new Set(Object.keys(SPECIALS));

const KIND_PREFIX = 'kind:';
const COMBO_PREFIX = 'combo:';
const SPECIAL_PREFIX = 'special:';

function kindShapeId(kind: ShapeKind): string {
  return `${KIND_PREFIX}${kind}`;
}
function comboShapeId(a: ShapeKind, b: ShapeKind): string {
  return `${COMBO_PREFIX}${a}+${b}`;
}
function specialShapeId(name: string): string {
  return `${SPECIAL_PREFIX}${name}`;
}

/** 'spark-burst' -> 'Spark Burst'. Used for picker labels only. */
function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface VfxAxes {
  layer: VfxLayer;
  kind: ShapeKind;
  combo?: ShapeKind;
  element?: ElementKey;
  size?: SizeKey;
  shapeId: string;
}

export interface VfxShape {
  id: string;
  label: string;
  layer: VfxLayer;
  hasElement: boolean;
  hasSize: boolean;
}
```

- [ ] **Step 5: Implement `buildIndex()`.**

Mirrors `buildRegistry()`'s three loops exactly, so the two cannot generate different names:

```ts
/** name -> the axes that produced it, for every key in buildRegistry().
 *  Lets a consumer decompose a stored name WITHOUT parsing it — kinds contain
 *  dashes (`spark-burst`, `beam-pop`, `burst-lines`), so `disc-spark-burst-fire`
 *  is a combo while `spark-burst-fire-lg` is a matrix entry, and a split on '-'
 *  cannot tell them apart. */
export function buildIndex(): Record<string, VfxAxes> {
  const index: Record<string, VfxAxes> = Object.create(null);

  for (const kind of Object.keys(KINDS) as ShapeKind[]) {
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      for (const [sizeKey, suffix] of SIZES) {
        const name = `${kind}-${element}${suffix ? `-${suffix}` : ''}`;
        index[name] = {
          layer: 'matrix',
          kind,
          element,
          size: sizeKey,
          shapeId: kindShapeId(kind),
        };
      }
    }
  }

  for (const [kindA, kindB] of COMBOS) {
    for (const element of Object.keys(ELEMENTS) as ElementKey[]) {
      index[`${kindA}-${kindB}-${element}`] = {
        layer: 'combo',
        kind: kindA,
        combo: kindB,
        element,
        shapeId: comboShapeId(kindA, kindB),
      };
    }
  }

  for (const [name, def] of Object.entries(SPECIALS)) {
    index[name] = {
      layer: 'special',
      kind: def.kind,
      shapeId: specialShapeId(name),
    };
  }

  return index;
}
```

- [ ] **Step 6: Implement `buildShapes()`.**

```ts
/** One entry per selectable Shape, in display order: kinds, then combos, then
 *  specials. 15 + 8 + 8 = 31. */
export function buildShapes(): VfxShape[] {
  const shapes: VfxShape[] = [];

  for (const kind of Object.keys(KINDS) as ShapeKind[]) {
    shapes.push({
      id: kindShapeId(kind),
      label: titleCase(kind),
      layer: 'matrix',
      hasElement: true,
      hasSize: true,
    });
  }

  for (const [kindA, kindB] of COMBOS) {
    shapes.push({
      id: comboShapeId(kindA, kindB),
      label: `${titleCase(kindA)} + ${titleCase(kindB)}`,
      layer: 'combo',
      hasElement: true,
      // Combos are generated at base size only — the registry has no
      // `nova-sparkle-fire-lg`, so the picker must not offer a size.
      hasSize: false,
    });
  }

  for (const name of Object.keys(SPECIALS)) {
    shapes.push({
      id: specialShapeId(name),
      label: titleCase(name),
      layer: 'special',
      hasElement: false,
      hasSize: false,
    });
  }

  return shapes;
}
```

- [ ] **Step 7: Implement `composeVfxName()`.**

```ts
/** axes -> generated name, or null if that combination isn't generated.
 *  Never throws: `shapeId` and `element` may come from persisted UI state. */
export function composeVfxName(
  shapeId: string,
  element?: ElementKey,
  size?: SizeKey,
): string | null {
  if (shapeId.startsWith(SPECIAL_PREFIX)) {
    const name = shapeId.slice(SPECIAL_PREFIX.length);
    return SPECIAL_KEYS.has(name) ? name : null;
  }

  if (shapeId.startsWith(COMBO_PREFIX)) {
    if (!element || !ELEMENT_KEYS.has(element)) return null;
    const [kindA, kindB] = shapeId.slice(COMBO_PREFIX.length).split('+');
    const known = COMBOS.some(([a, b]) => a === kindA && b === kindB);
    return known ? `${kindA}-${kindB}-${element}` : null;
  }

  if (shapeId.startsWith(KIND_PREFIX)) {
    const kind = shapeId.slice(KIND_PREFIX.length);
    if (!KIND_KEYS.has(kind)) return null;
    if (!element || !ELEMENT_KEYS.has(element)) return null;
    const entry = SIZES.find(([key]) => key === (size ?? 'base'));
    if (!entry) return null;
    const suffix = entry[1];
    return `${kind}-${element}${suffix ? `-${suffix}` : ''}`;
  }

  return null;
}
```

- [ ] **Step 8: Add the failing assertions to the check script.**

In `scripts/vfx-registry-check.ts`, **replace the existing import line** — it currently reads `import { buildRegistry, KINDS } from '@/vfx-engine';` — with:

```ts
import {
  buildIndex,
  buildRegistry,
  buildShapes,
  composeVfxName,
  type ElementKey,
  KINDS,
} from '@/vfx-engine';
```

Then append the following before the existing final `console.log`. It reuses the script's existing locals `registry`, `names`, `KIND_NAMES` and `assert` — do not redeclare them:

```ts
const index = buildIndex();
const shapes = buildShapes();
const indexNames = Object.keys(index);

// Identical KEY SETS, not just equal counts — a rename must fail loudly.
assert(
  indexNames.length === names.length,
  `index has ${indexNames.length} names, registry has ${names.length}`,
);
for (const name of names) {
  assert(index[name] !== undefined, `registry name missing from index: ${name}`);
}
for (const name of indexNames) {
  assert(registry[name] !== undefined, `index name missing from registry: ${name}`);
}

// THE load-bearing property: every generated name must survive
// decompose -> compose unchanged. This is what catches a dashed-kind or
// combo mis-parse, and a SizeKey('base') leaking into a name suffix.
for (const name of names) {
  const axes = index[name];
  const round = composeVfxName(axes.shapeId, axes.element, axes.size);
  assert(round === name, `round-trip failed: ${name} -> ${round}`);
}

// Shapes: unique ids, correct axis flags, and a 1:1 relationship with the index.
const shapeIds = shapes.map((s) => s.id);
assert(shapeIds.length === new Set(shapeIds).size, 'shape ids must be unique');
assert(shapes.length === 31, `expected 31 shapes, got ${shapes.length}`);

const shapeById = new Map(shapes.map((s) => [s.id, s]));
for (const name of indexNames) {
  const axes = index[name];
  const shape = shapeById.get(axes.shapeId);
  assert(shape !== undefined, `${name}: shapeId "${axes.shapeId}" not in buildShapes()`);
  assert(
    shape.hasElement === (axes.element !== undefined),
    `${name}: shape.hasElement=${shape.hasElement} but element=${axes.element}`,
  );
  assert(
    shape.hasSize === (axes.size !== undefined),
    `${name}: shape.hasSize=${shape.hasSize} but size=${axes.size}`,
  );
  assert(KIND_NAMES.has(axes.kind), `${name}: unknown axes kind "${axes.kind}"`);
}

const reachable = new Set(indexNames.map((n) => index[n].shapeId));
for (const shape of shapes) {
  assert(reachable.has(shape.id), `shape "${shape.id}" is unreachable from the index`);
}

// A prototype key must not compose a name (see the Object.create(null) note
// in registry.ts — the same hazard applies to the compose path).
assert(composeVfxName('kind:constructor', 'fire') === null, 'prototype kind must not compose');
assert(composeVfxName('kind:nova', 'toString' as ElementKey) === null, 'prototype element must not compose');
assert(composeVfxName('special:constructor') === null, 'prototype special must not compose');
assert(composeVfxName('nope:whatever') === null, 'unknown shape prefix must not compose');

console.log(`vfx-index: ${indexNames.length} names, ${shapes.length} shapes, round-trip OK`);
```

- [ ] **Step 9: Run the check — it must PASS.**

Run: `pnpm vfx:check`
Expected: both lines — `vfx-registry: 379 effects, checks passed` and `vfx-index: 379 names, 31 shapes, round-trip OK`.

If the round-trip assertion fires, the most likely cause is `'base'` leaking into a suffix (Step 1/7) or a combo id split mismatch.

- [ ] **Step 10: Sync the engine and verify parity.**

```bash
bash scripts/sync-vfx-engine.sh
pnpm vfx:parity
```
Expected: 6 files `ok`, `vfx-engine parity: OK`, `379 effects, eoweb registry keys === aio-editor registry keys`.

- [ ] **Step 11: Gates + commit.**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check --write src/vfx-engine scripts
pnpm exec biome check src/vfx-engine scripts
```
All clean. Then commit in **both** repos (the sync wrote into aio-editor):

```bash
git -C /Users/cfraser/Projects/eoweb add src/vfx-engine scripts
git -C /Users/cfraser/Projects/eoweb commit -m "feat(vfx): structured index for name<->axes decomposition"
git -C /Users/cfraser/Projects/aio-editor add packages/frontend/src/vfx-engine
git -C /Users/cfraser/Projects/aio-editor commit -m "chore(vfx): re-sync vendored vfx-engine"
```

---

### Task 2: The `VfxField` component + routing

**Files:**
- Create: `aio-editor/packages/frontend/src/pubs/form/VfxField.tsx`
- Modify: `aio-editor/packages/frontend/src/pubs/form/fields.tsx` (dispatch at ~line 48; `SuggestField` at ~line 1324)

**Interfaces:**
- Consumes from Task 1: `buildIndex`, `buildShapes`, `composeVfxName`, `ELEMENTS`, `ElementKey`, `SizeKey`, `VfxAxes`, `VfxShape` — imported from `../../vfx-engine` (**relative — aio-editor has no `@/` alias**).
- Consumes existing: `VfxPreview` from `./VfxPreview` (unchanged), `VFX_SUGGESTIONS` from `./suggest-values` (raw mode's datalist).
- Produces: `export function VfxField({ value, onChange }: { value: string; onChange: (next: string) => void })`.

**Boundary:** `VfxField` renders **only** the controls + preview. `fields.tsx` keeps owning `FieldLabel` chrome. Do NOT import `FieldLabel` into `VfxField.tsx` — that would be a circular import, and one `<label>` wrapping three controls is wrong HTML anyway.

- [ ] **Step 1: Create `VfxField.tsx` — module constants and decomposition.**

```tsx
import { useRef, useState } from "react";

import {
  buildIndex,
  buildShapes,
  composeVfxName,
  ELEMENTS,
  type ElementKey,
  type SizeKey,
  type VfxAxes,
  type VfxShape,
} from "../../vfx-engine";
import { VFX_SUGGESTIONS } from "./suggest-values";
import { VfxPreview } from "./VfxPreview";

/** Both allocate their whole structure per call — build once at module scope,
 *  same as VfxPreview does with buildRegistry(). */
const VFX_INDEX: Record<string, VfxAxes> = buildIndex();
const VFX_SHAPES: VfxShape[] = buildShapes();
const SHAPE_BY_ID = new Map(VFX_SHAPES.map((s) => [s.id, s]));

/** eoweb's two sprite-sheet effects live in its vfx-manifest, NOT the engine,
 *  so they have no axes and must be listed here by hand. A third sheet means
 *  editing this array. */
const SHEET_NAMES = ["cast-burst", "fire-impact"];
const SHEET_PREFIX = "sheet:";

const NONE_ID = "none";
const CUSTOM_ID = "custom";

const ELEMENT_ORDER: ElementKey[] = [
  "neutral", "fire", "water", "earth", "wind", "light", "dark",
];
const SIZE_ORDER: ReadonlyArray<readonly [SizeKey, string]> = [
  ["sm", "S"], ["base", "M"], ["lg", "L"],
];

function hex(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

interface Selection {
  shapeId: string;
  element?: ElementKey;
  size?: SizeKey;
}

/** stored string -> control state. Never parses: it's an index lookup, so a
 *  dashed kind (`spark-burst-fire-lg`) and a combo (`disc-spark-burst-fire`)
 *  resolve correctly without disambiguation. */
function decompose(value: string): Selection {
  if (!value) return { shapeId: NONE_ID };
  if (SHEET_NAMES.includes(value)) return { shapeId: `${SHEET_PREFIX}${value}` };
  const axes = VFX_INDEX[value];
  if (axes) return { shapeId: axes.shapeId, element: axes.element, size: axes.size };
  return { shapeId: CUSTOM_ID };
}
```

- [ ] **Step 2: Add the component body — state, memory, and the emit path.**

```tsx
export function VfxField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [raw, setRaw] = useState(false);
  /** Last element/size the author picked, so Nova -> Heal Glow -> Nova restores
   *  the tint and size instead of snapping back to neutral/base. Refs, not
   *  state: they're only read when composing the NEXT value and must never
   *  trigger a render. Written in `emit` (a handler), never during render. */
  const lastElement = useRef<ElementKey>("neutral");
  const lastSize = useRef<SizeKey>("base");

  const sel = decompose(value);
  const shape = SHAPE_BY_ID.get(sel.shapeId);
  const isCustom = sel.shapeId === CUSTOM_ID;
  const isSheet = sel.shapeId.startsWith(SHEET_PREFIX);
  const hasElement = shape?.hasElement ?? false;
  const hasSize = shape?.hasSize ?? false;

  const emit = (shapeId: string, element: ElementKey, size: SizeKey) => {
    lastElement.current = element;
    lastSize.current = size;
    if (shapeId === NONE_ID) return onChange("");
    if (shapeId.startsWith(SHEET_PREFIX)) {
      return onChange(shapeId.slice(SHEET_PREFIX.length));
    }
    const next = composeVfxName(shapeId, element, size);
    if (next) onChange(next);
  };

  const pickShape = (id: string) => {
    if (id === CUSTOM_ID) return; // display-only pinned entry
    emit(id, sel.element ?? lastElement.current, sel.size ?? lastSize.current);
  };
  const pickElement = (el: ElementKey) =>
    emit(sel.shapeId, el, sel.size ?? lastSize.current);
  const pickSize = (sz: SizeKey) =>
    emit(sel.shapeId, sel.element ?? lastElement.current, sz);
```

- [ ] **Step 3: Add the raw-mode early return.**

Still inside the component, before the picker JSX:

```tsx
  if (raw) {
    return (
      <div className="mt-0.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            list="vfx-raw-suggestions"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/40"
          />
          <button
            type="button"
            onClick={() => setRaw(false)}
            className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:bg-slate-800/60"
            title="Back to pickers"
          >
            ‹
          </button>
        </div>
        <datalist id="vfx-raw-suggestions">
          {VFX_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <VfxPreview value={value} />
      </div>
    );
  }
```

- [ ] **Step 4: Add the picker JSX and close the component.**

```tsx
  return (
    <div className="mt-0.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <select
          value={sel.shapeId}
          onChange={(e) => pickShape(e.target.value)}
          className={`w-full rounded-md border bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/40 ${
            isCustom ? "border-amber-600/70" : "border-slate-700"
          }`}
        >
          {isCustom && <option value={CUSTOM_ID}>⚠ Custom: {value}</option>}
          <option value={NONE_ID}>None</option>
          {VFX_SHAPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          {SHEET_NAMES.map((n) => (
            <option key={n} value={`${SHEET_PREFIX}${n}`}>
              {n} (sheet)
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRaw(true)}
          className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:bg-slate-800/60"
          title="Edit the raw effect name"
        >
          ›
        </button>
      </div>

      {isCustom && (
        <p className="text-xs text-amber-500/90">not a known effect — kept as-is</p>
      )}

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {ELEMENT_ORDER.map((el) => (
            <button
              key={el}
              type="button"
              disabled={!hasElement}
              onClick={() => pickElement(el)}
              title={el}
              style={{ backgroundColor: hex(ELEMENTS[el]) }}
              className={`h-5 w-5 rounded-full border transition disabled:opacity-25 ${
                sel.element === el
                  ? "border-slate-100 ring-2 ring-slate-400/70"
                  : "border-slate-600 hover:border-slate-400"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          {SIZE_ORDER.map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={!hasSize}
              onClick={() => pickSize(key)}
              className={`w-7 rounded border px-1 py-0.5 text-xs transition disabled:opacity-25 ${
                sel.size === key
                  ? "border-slate-400 bg-slate-700 text-slate-100"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!isSheet && !isCustom && sel.shapeId !== NONE_ID && (
        <p className="font-mono text-[10px] text-slate-500">→ {value}</p>
      )}

      <VfxPreview value={value} />
    </div>
  );
}
```

- [ ] **Step 5: Route vfx paths to the new field in `fields.tsx`.**

Add the import near the existing form-component imports:

```tsx
import { VfxField } from "./VfxField";
```

Replace the `x-aio-suggest` branch in `SchemaField` (~line 47-49):

```tsx
  if (resolved["x-aio-suggest"]) {
    if (isVfxPath(props.path)) {
      return <VfxSuggestField {...props} schema={resolved} />;
    }
    return <SuggestField {...props} schema={resolved} />;
  }
```

- [ ] **Step 6: Add the `VfxSuggestField` wrapper that owns the label chrome.**

Place it immediately after `SuggestField` in `fields.tsx`:

```tsx
/** `cast_vfx`/`impact_vfx`. A plain <div>, not a <label>: VfxField renders three
 *  separate controls, and a single <label> wrapping all of them would associate
 *  the caption with whichever one the browser picks. */
function VfxSuggestField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  return (
    <div className="group/field block">
      <FieldLabel
        label={label}
        required={required}
        description={schema.description}
        path={path}
        compact={compact}
      />
      <VfxField
        value={typeof value === "string" ? value : ""}
        onChange={(next) => onChange(next)}
      />
    </div>
  );
}
```

- [ ] **Step 7: Remove the now-dead preview call from `SuggestField`.**

Vfx paths no longer reach `SuggestField`, so this line inside it is dead:

```tsx
      {isVfxPath(path) && <VfxPreview value={current} />}
```

Delete it. Then update `SuggestField`'s doc comment, which claims vfx fields get a preview there, and update `isVfxPath`'s doc comment (it now gates *routing*, not the preview). If `VfxPreview` is no longer imported by `fields.tsx`, remove that import — `noUnusedLocals` will fail the build otherwise.

**Do NOT touch `suggestionsForPath`** — it still serves `icon_id`, and `VFX_SUGGESTIONS` is still used by raw mode.

- [ ] **Step 8: Gate + commit.**

```bash
cd /Users/cfraser/Projects/aio-editor/packages/frontend && npx tsc -p tsconfig.json --noEmit
```
Expected: exit 0, no output. (`noUnusedLocals`/`noUnusedParameters`/`noUncheckedIndexedAccess` are on — a leftover import or an unguarded index will fail here.)

Reason through and record in your report what renders for each of: (a) `nova-fire-lg`, (b) `nova-sparkle-fire` (combo — Size must be disabled), (c) `heal-glow` (special — both disabled), (d) `cast-burst` (sheet), (e) `""` (None), (f) `zzz-nonsense` (Custom, preserved), (g) switching Nova → Heal Glow → Nova (element/size restored).

```bash
git add packages/frontend/src/pubs/form/VfxField.tsx packages/frontend/src/pubs/form/fields.tsx
git commit -m "feat(vfx): shape/element/size pickers for cast_vfx and impact_vfx"
```

---

### Task 3: Integration — parity, manual pass doc, merge readiness

**Files:**
- Create: `eoweb/docs/superpowers/plans/2026-08-05-vfx-field-decomposition-manual-pass.md`

**Interfaces:** Consumes everything from Tasks 1-2. Produces no code API.

- [ ] **Step 1: Re-run every gate across both repos.**

```bash
cd /Users/cfraser/Projects/eoweb && pnpm exec tsc --noEmit && pnpm exec biome check src/vfx-engine scripts && pnpm vfx:check && pnpm vfx:parity
cd /Users/cfraser/Projects/aio-editor/packages/frontend && npx tsc -p tsconfig.json --noEmit
```
All must pass. `vfx:parity` must show 6 files matching — if it doesn't, Task 1's sync didn't happen or someone hand-edited the vendored copy.

- [ ] **Step 2: Confirm reoserv is untouched.**

```bash
git -C /Users/cfraser/Projects/reoserv status --short
```
Expected: exactly the two pre-existing WIP files `data/pub/npcs/0007.json` and `data/pub/skills/rage.json`, and nothing else. If anything else appears, something violated the client-only constraint — stop and report.

- [ ] **Step 3: Verify every effect name you plan to put in the doc actually exists.**

Write a throwaway tsx script under `eoweb/.superpowers/` (git-ignored) that imports `buildRegistry`/`buildIndex`/`buildShapes` and prints membership for each name you intend to cite. **Do not pick names by eye** — the previous VFX plan shipped a spec whose running example (`impact-water-lg`) never existed. Names to verify: `nova-fire-lg`, `nova-sparkle-fire`, `heal-glow`, `cast-burst`, `fire-impact`, and confirm `nova-sparkle-fire-lg` does **not** exist (that's the combos-are-base-size-only case the UI now surfaces).

- [ ] **Step 4: Write the manual-pass doc.**

Create `eoweb/docs/superpowers/plans/2026-08-05-vfx-field-decomposition-manual-pass.md` covering, as numbered steps a human follows in a browser:

1. **Prereqs** — aio-editor running (`npm run dev:backend` then `npm run dev:frontend`), skills section open. eoweb/reoserv are NOT needed: this change is editor-only and the preview renders from the vendored engine.
2. **Decomposition** — open `strike`, whose `cast_vfx` is `cast-burst` and `impact_vfx` is `fire-impact`: both must show as `cast-burst (sheet)` / `fire-impact (sheet)` with Element and Size greyed out and the preview in its muted "no preview (sheet/unknown)" state.
3. **Matrix** — set Shape to `Nova`, Element to Fire, Size to L. The `→` line must read `nova-fire-lg`, the preview must animate an orange nova, and the JSON view must show `"cast_vfx": "nova-fire-lg"`.
4. **Element switching** — click through all 7 chips; the preview retints each time and the composed name tracks.
5. **Combo** — pick `Nova + Sparkle`. Element stays enabled, **Size greys out**, name reads `nova-sparkle-fire`. This is the rule the old flat list hid.
6. **Special** — pick `Heal Glow`. Both Element and Size grey out; name reads `heal-glow`; preview shows the green glow.
7. **Axis memory** — from `nova-fire-lg`, switch to `Heal Glow`, then back to `Nova`: Fire and L must be restored (giving `nova-fire-lg` again), not neutral/M.
8. **None** — pick `None`; the field must clear to `""` in the JSON view (not `"none"`).
9. **Custom preservation** — in the JSON view, hand-set `cast_vfx` to `zzz-nonsense`. The Shape select must show a pinned `⚠ Custom: zzz-nonsense`, show "not a known effect — kept as-is", grey both axes, and **leave the value untouched** on save.
10. **Raw toggle** — `›` swaps to the free-text input with the full datalist; type `nova-water`; `‹` returns to the pickers showing Nova + Water.
11. **No collateral damage** — `icon_id` on the same form still renders its plain datalist input with no pickers and no preview; open an item and an NPC form and confirm they're unaffected and console-clean.
12. **Restore** — put `strike.json` back to `cast-burst` / `fire-impact` and confirm `git -C reoserv status` shows no new diff.

- [ ] **Step 5: Commit and merge.**

```bash
git -C /Users/cfraser/Projects/eoweb add docs/superpowers/plans/2026-08-05-vfx-field-decomposition-manual-pass.md
git -C /Users/cfraser/Projects/eoweb commit -m "docs(vfx): manual verification pass for the field decomposition"
```

Then use **superpowers:finishing-a-development-branch** for BOTH repos (ff-merge `feat/vfx-field-decomposition` → local `master`, delete the branches, never push).

---

## Self-Review notes (for the executor)

- **Spec coverage:** engine index/shapes/compose + assertions (Task 1); Shape/Element/Size/preview/raw-toggle/Custom + routing (Task 2); parity, name verification, manual pass (Task 3). Every spec section maps to a task.
- **Type consistency:** `VfxAxes`/`VfxShape`/`SizeKey`/`VfxLayer` are declared once in Task 1 Step 4 and consumed verbatim in Task 2 Step 1. `composeVfxName(shapeId, element?, size?)` has the same signature in Task 1 Step 7, Task 1 Step 8's assertions, and Task 2 Step 2's `emit`.
- **The one subtle trap** is `SizeKey 'base'` vs the empty name suffix. Task 1 Step 1 separates them, Step 7 maps them, and Step 8's round-trip assertion is what fails if they get crossed. Do not "simplify" `SIZES` back to a 2-tuple.
- **Prototype-key hazard:** `KIND_KEYS`/`ELEMENT_KEYS`/`SPECIAL_KEYS` are `Set`s deliberately — reverting them to `key in obj` would let `constructor` compose a name. Assertions in Step 8 cover this.
- **No unit-test runner exists in either repo.** Task 1's real test suite is `pnpm vfx:check` (genuinely executable — write the assertions and watch them pass/fail). Task 2's only automated gate is `tsc`; its behavioral verification is Task 3's documented manual pass. Don't claim Task 2 is "tested" beyond that.
