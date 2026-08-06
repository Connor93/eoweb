// Headless sanity check for the vfx-engine's generated palette. Run via
// `pnpm vfx:check` (tsx, no build step). Must NOT touch the DOM — it never
// calls draw()/renderFrameCanvas(), only inspects the registry's data.
import {
  buildIndex,
  buildRegistry,
  buildShapes,
  composeVfxName,
  DEPTH_LAYERS,
  DESIGN_SIZE,
  ELEMENTS,
  type ElementKey,
  effectDurationMs,
  FRAME_SIZE,
  frameProgress,
  GROUND_FRAME,
  INTERNAL_SIZE,
  KINDS,
  PIXEL_SCALE,
  RAMP_BASE,
  SQUARE_FRAME,
  TALL_FRAME,
} from '@/vfx-engine';

const KIND_NAMES = new Set(Object.keys(KINDS));

// Three-layer draw API (Task 4): `front` is mandatory for every kind —
// TypeScript already enforces this at compile time (KindConfig.draw.front is
// non-optional), but this is the runtime proof for the one thing tsc can't
// see: that every entry in KINDS actually satisfies the type rather than,
// say, a stray `as any`. `behind`/`tint` are optional, so they're checked
// only for "function or absent", never required.
//
// This script never touches the DOM (see the header comment above), so it
// can't call renderFrameCanvas/drawEffectAt to prove a canvas comes out the
// other end — `KINDS[kind].draw.front` being a function is the closest
// headless proxy for "renderFrameCanvas(def, 0).front is non-null" for every
// def, since renderFrameCanvas always rasterises `front` unconditionally.
for (const [kind, config] of Object.entries(KINDS)) {
  assert(
    typeof config.draw.front === 'function',
    `${kind}: draw.front must be a function`,
  );
  for (const layer of DEPTH_LAYERS) {
    const fn = config.draw[layer];
    assert(
      fn === undefined || typeof fn === 'function',
      `${kind}: draw.${layer} must be a function or undefined`,
    );
  }
}
assert(
  DEPTH_LAYERS.length === 3 &&
    DEPTH_LAYERS.includes('behind') &&
    DEPTH_LAYERS.includes('tint') &&
    DEPTH_LAYERS.includes('front'),
  `DEPTH_LAYERS must be exactly ['behind', 'tint', 'front'], got ${JSON.stringify(DEPTH_LAYERS)}`,
);

const SPECIALS = [
  'heal-glow',
  'buff-aura',
  'debuff-sink',
  'shield-flash',
  'cast-arcane',
  'level-up',
  'crit-flash',
  'stun-stars',
];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`vfx-registry-check: ${message}`);
  }
}

assert(
  FRAME_SIZE === INTERNAL_SIZE * PIXEL_SCALE,
  `FRAME_SIZE ${FRAME_SIZE} must equal INTERNAL_SIZE ${INTERNAL_SIZE} * PIXEL_SCALE ${PIXEL_SCALE} — a fractional upscale gives unevenly-sized pixels`,
);
assert(
  Number.isInteger(PIXEL_SCALE) && PIXEL_SCALE >= 1,
  'PIXEL_SCALE must be a positive integer',
);
assert(
  DESIGN_SIZE === 128,
  "DESIGN_SIZE is the tuned draw space — changing it invalidates every kind's geometry budget",
);

const registry = buildRegistry();
const names = Object.keys(registry);

assert(names.length === 407, `expected 407 effects, got ${names.length}`);
assert(names.length === new Set(names).size, 'effect names must be unique');

for (const name of names) {
  const def = registry[name];
  assert(KIND_NAMES.has(def.kind), `${name}: unknown kind "${def.kind}"`);
  assert(def.frames > 0, `${name}: frames must be > 0`);
  assert(def.sizeScale > 0, `${name}: sizeScale must be > 0`);
  // Stand-in for `renderFrameCanvas(def, 0).front` being non-null (see the
  // KINDS loop above for why this script can't rasterise and check that
  // directly): every def's kind must resolve to a `front` draw function.
  assert(
    typeof KINDS[def.kind].draw.front === 'function',
    `${name}: KINDS["${def.kind}"].draw.front must be a function`,
  );
  if (def.combo !== undefined) {
    assert(
      KIND_NAMES.has(def.combo),
      `${name}: unknown combo kind "${def.combo}"`,
    );
    assert(
      typeof KINDS[def.combo].draw.front === 'function',
      `${name}: KINDS["${def.combo}"].draw.front must be a function`,
    );
  }

  // Cadence: frames/loops/frameMs must be positive integers, so a repeating
  // cycle is well-defined and effectDurationMs() never divides/yields 0 or a
  // fractional frame boundary.
  assert(
    Number.isInteger(def.frames) && def.frames > 0,
    `${name}: frames must be a positive integer, got ${def.frames}`,
  );
  assert(
    Number.isInteger(def.loops) && def.loops > 0,
    `${name}: loops must be a positive integer, got ${def.loops}`,
  );
  assert(
    Number.isInteger(def.frameMs) && def.frameMs > 0,
    `${name}: frameMs must be a positive integer, got ${def.frameMs}`,
  );
  assert(
    effectDurationMs(def) > 0,
    `${name}: effectDurationMs() must be > 0, got ${effectDurationMs(def)}`,
  );

  // Midpoint sampling: frameProgress() must never land exactly on 0 or 1 for
  // any in-cycle frame index — several kinds are geometrically degenerate
  // (zero radius/length/height) at those exact endpoints and would render
  // blank. See frameProgress()'s doc comment in render.ts.
  for (let i = 0; i < def.frames; i++) {
    const p = frameProgress(def, i);
    assert(
      p > 0 && p < 1,
      `${name}: frameProgress(def, ${i}) = ${p}, must lie strictly in (0, 1)`,
    );
  }
}

for (const special of SPECIALS) {
  assert(special in registry, `missing special effect "${special}"`);
}

const index = buildIndex();
const shapes = buildShapes();

// Set pieces must NOT have leaked into the matrix (the trap MATRIX_KINDS
// exists to avoid — see registry.ts). If Object.keys(KINDS) ever crept back
// into a matrix-generating loop, each set piece would silently gain 21
// matrix names (7 elements x 3 sizes) and these would fail.
for (const sp of ['bolt', 'smite', 'rockfall', 'ring-of-fire']) {
  for (const element of Object.keys(ELEMENTS)) {
    for (const suffix of ['sm', 'lg']) {
      const leaked = `${sp}-${element}-${suffix}`;
      assert(
        registry[leaked] === undefined,
        `set piece leaked into the matrix: ${leaked}`,
      );
    }
  }
  const shape = shapes.find((s) => s.id === `setpiece:${sp}`);
  assert(shape !== undefined, `missing set-piece shape: ${sp}`);
  assert(shape.hasElement === true, `${sp}: hasElement must be true`);
  assert(shape.hasSize === false, `${sp}: hasSize must be false`);
}
const indexNames = Object.keys(index);

// Identical KEY SETS, not just equal counts — a rename must fail loudly.
assert(
  indexNames.length === names.length,
  `index has ${indexNames.length} names, registry has ${names.length}`,
);
for (const name of names) {
  assert(
    index[name] !== undefined,
    `registry name missing from index: ${name}`,
  );
}
for (const name of indexNames) {
  assert(
    registry[name] !== undefined,
    `index name missing from registry: ${name}`,
  );
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
assert(shapes.length === 35, `expected 35 shapes, got ${shapes.length}`);

const shapeById = new Map(shapes.map((s) => [s.id, s]));
for (const name of indexNames) {
  const axes = index[name];
  const shape = shapeById.get(axes.shapeId);
  assert(
    shape !== undefined,
    `${name}: shapeId "${axes.shapeId}" not in buildShapes()`,
  );
  assert(
    shape.hasElement === (axes.element !== undefined),
    `${name}: shape.hasElement=${shape.hasElement} but element=${axes.element}`,
  );
  assert(
    shape.hasSize === (axes.size !== undefined),
    `${name}: shape.hasSize=${shape.hasSize} but size=${axes.size}`,
  );
  assert(
    KIND_NAMES.has(axes.kind),
    `${name}: unknown axes kind "${axes.kind}"`,
  );
}

const reachable = new Set(indexNames.map((n) => index[n].shapeId));
for (const shape of shapes) {
  assert(
    reachable.has(shape.id),
    `shape "${shape.id}" is unreachable from the index`,
  );
}

// A prototype key must not compose a name (see the Object.create(null) note
// in registry.ts — the same hazard applies to the compose path).
assert(
  composeVfxName('kind:constructor', 'fire') === null,
  'prototype kind must not compose',
);
assert(
  composeVfxName('kind:nova', 'toString' as ElementKey) === null,
  'prototype element must not compose',
);
assert(
  composeVfxName('special:constructor') === null,
  'prototype special must not compose',
);
assert(
  composeVfxName('setpiece:constructor', 'fire') === null,
  'prototype setpiece must not compose',
);
assert(
  composeVfxName('nope:whatever') === null,
  'unknown shape prefix must not compose',
);

// A malformed/near-miss setpiece shapeId must not compose something
// plausible — same principle as the malformed combo checks below.
assert(
  composeVfxName('setpiece:bolt-extra', 'fire') === null,
  'malformed setpiece shapeId must not compose',
);
assert(
  composeVfxName('setpiece:bol', 'fire') === null,
  'truncated setpiece name must not compose',
);
assert(
  composeVfxName('setpiece:bolt') === null,
  'setpiece shapeId without an element must not compose',
);
assert(
  composeVfxName('setpiece:bolt', 'fire', 'lg') === 'bolt-fire',
  'setpiece composition must ignore a size argument',
);

// A malformed combo shapeId (wrong part count after `split('+')`) must not
// silently drop the extra content and compose anyway.
assert(
  composeVfxName('combo:nova+sparkle+extra', 'fire') === null,
  'combo shapeId with trailing +extra must not compose',
);
assert(
  composeVfxName('combo:nova', 'fire') === null,
  'combo shapeId with only one part must not compose',
);
assert(
  composeVfxName('combo:nova+nova', 'fire') === null,
  'combo of two real kinds never paired in COMBOS must not compose',
);

// The combat-element colours the engine palette mirrors. If these drift, the
// damage numbers and the VFX stop agreeing about what "fire" looks like.
const COMBAT_COLORS: Record<string, number> = {
  neutral: 0xfff8e1,
  fire: 0xfb923c,
  water: 0x60a5fa,
  earth: 0x84cc16,
  wind: 0xfacc15,
  light: 0xfde047,
  dark: 0xa855f7,
};

for (const [element, ramp] of Object.entries(ELEMENTS)) {
  assert(
    ramp.length === 4,
    `${element}: ramp must have 4 rungs, got ${ramp.length}`,
  );
  for (const c of ramp) {
    assert(
      Number.isInteger(c) && c >= 0 && c <= 0xffffff,
      `${element}: bad rung ${c}`,
    );
  }
  assert(
    ramp[RAMP_BASE] === COMBAT_COLORS[element],
    `${element}: base rung 0x${(ramp[RAMP_BASE] as number).toString(16)} != combat colour 0x${COMBAT_COLORS[element]?.toString(16)}`,
  );
}

for (const name of names) {
  const def = registry[name];
  assert(
    Array.isArray(def.ramp) && def.ramp.length === 4,
    `${name}: def.ramp must have 4 rungs`,
  );
}

// Per-def frame geometry (Task 1): every def carries a `frame`, and its
// derived numbers must be internally consistent — the integer-upscale rule
// applies PER AXIS now (a frame can be taller than it is wide), and the
// ground point must actually lie inside the draw-space box.
for (const name of names) {
  const f = registry[name].frame;
  assert(
    f.outW === f.internalW * PIXEL_SCALE,
    `${name}: outW ${f.outW} != internalW ${f.internalW} * ${PIXEL_SCALE}`,
  );
  assert(
    f.outH === f.internalH * PIXEL_SCALE,
    `${name}: outH ${f.outH} != internalH ${f.internalH} * ${PIXEL_SCALE}`,
  );
  assert(
    Number.isInteger(f.internalW) && Number.isInteger(f.internalH),
    `${name}: raster dims must be integers`,
  );
  // The two outW/outH assertions above only prove EACH axis upscales evenly
  // from ITS OWN internal size — neither says the two axes were derived from
  // the SAME factor. rasterizeLayer (render.ts) derives a single k =
  // internalW / designW and applies it to both axes via ctx.scale(k, k), so
  // a makeFrame() call whose designW:designH ratio doesn't divide evenly at
  // this resolution (verified via cross-multiplication, not division, to
  // stay exact in integer math) would still pass every check above while
  // rendering vertically mis-scaled with the ground point off.
  assert(
    f.internalW * f.designH === f.internalH * f.designW,
    `${name}: design ${f.designW}x${f.designH} does not scale to raster ${f.internalW}x${f.internalH} by one factor`,
  );
  assert(
    f.groundY > 0 && f.groundY <= f.designH,
    `${name}: groundY ${f.groundY} outside the frame`,
  );
  assert(
    f.anchorY > 0 && f.anchorY <= 1,
    `${name}: anchorY ${f.anchorY} out of range`,
  );
  assert(
    f.anchorY === f.groundY / f.designH,
    `${name}: anchorY out of sync with groundY`,
  );
}

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

console.log(
  `vfx-index: ${indexNames.length} names, ${shapes.length} shapes, round-trip OK`,
);

console.log(
  `vfx-kinds: ${KIND_NAMES.size} kinds, front present for all, behind/tint optional`,
);

console.log(`vfx-registry: ${names.length} effects, checks passed`);
