// Headless sanity check for the vfx-engine's generated palette. Run via
// `pnpm vfx:check` (tsx, no build step). Must NOT touch the DOM — it never
// calls draw()/renderFrameCanvas(), only inspects the registry's data.
import {
  ARCANE_START_ABOVE,
  ARCANE_STREAK_LEN,
  buildIndex,
  buildRegistry,
  buildShapes,
  CLEAVE_FRAMES_PER_CYCLE,
  type CycleKey,
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
  SWORDFALL_START_ABOVE,
  SWORDFALL_TOTAL_HEIGHT,
  TALL_FRAME,
  WHIRLWIND_BAND_FLATTEN,
  WHIRLWIND_HEIGHT,
  WHIRLWIND_SWAY,
  WHIRLWIND_TOP_HALF_W,
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

assert(names.length === 526, `expected 526 effects, got ${names.length}`);
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

// cycleMode invariant. Asserted for shapes WITH the cycles axis only:
// ring-of-fire declares loops: 3 and no axis, so an unrestricted
// `loops === cycles` would fail on it.
//
// The mode a shape SHOULD use is restated here, not read from SET_PIECES —
// reading it back would make this tautological, and both modes yield the
// same total duration, so a mis-wired multiplier is otherwise invisible.
const FRAME_MODE_SHAPES = new Set<string>(['cleave']);
const CYCLE_BASE_FRAMES = 4;

// drawCleave recovers "how many cleaves am I part of" as
// def.frames / CLEAVE_FRAMES_PER_CYCLE, so the registry's base frame count
// must equal that constant or every flurry mis-partitions.
assert(
  CLEAVE_FRAMES_PER_CYCLE === CYCLE_BASE_FRAMES,
  `CLEAVE_FRAMES_PER_CYCLE (${CLEAVE_FRAMES_PER_CYCLE}) must equal the registry's base frame count (${CYCLE_BASE_FRAMES})`,
);
assert(
  shapes.filter((s) => s.id === 'setpiece:cleave').length === 1,
  'cleave must be registered as exactly one shape',
);

const CYCLE_SHAPE_IDS = new Set(
  shapes.filter((s) => s.layer === 'setpiece' && s.hasCycles).map((s) => s.id),
);

for (const [name, def] of Object.entries(registry)) {
  const axes = index[name];
  if (axes?.layer !== 'setpiece') continue;
  if (!CYCLE_SHAPE_IDS.has(axes.shapeId)) continue;
  const cycles = axes.cycles ?? 1;

  if (FRAME_MODE_SHAPES.has(axes.kind)) {
    assert(
      def.loops === 1,
      `${name}: frames-mode set piece must have loops 1, got ${def.loops}`,
    );
    assert(
      def.frames === CYCLE_BASE_FRAMES * cycles,
      `${name}: frames-mode set piece must have frames ${CYCLE_BASE_FRAMES * cycles}, got ${def.frames}`,
    );
  } else {
    assert(
      def.frames === CYCLE_BASE_FRAMES,
      `${name}: loop-mode set piece must have frames ${CYCLE_BASE_FRAMES}, got ${def.frames}`,
    );
    assert(
      def.loops === cycles,
      `${name}: loop-mode set piece must have loops ${cycles}, got ${def.loops}`,
    );
  }
}

// Set pieces' cadence is load-bearing beyond "constant within one shape"
// (which the per-name frames/loops/frameMs check far above already proves):
// SET_PIECES' own doc comment in registry.ts makes "a cycle is
// 4 * 100ms = 400ms" the reason a descent's first cycle finishes landing in
// sync with the damage number (skills have no cast time, so damage and
// impact_vfx resolve together). Nothing before this asserted the literal
// 100 — only that it didn't vary — so a future SET_PIECES entry authored
// with a different frameMs would silently desync its impact from the
// damage number with every other gate still green.
for (const [name, def] of Object.entries(registry)) {
  if (index[name]?.layer !== 'setpiece') continue;
  assert(
    def.frameMs === 100,
    `${name}: set-piece frameMs must be 100 (see SET_PIECES' doc comment in registry.ts for why the cadence is load-bearing), got ${def.frameMs}`,
  );
}

// poison's 400ms is a CONTRACT, not a style choice. It is intended to fire on
// every DoT tick, and the authored poison status ticks at 1000ms — a longer
// effect would overlap itself and read as a smear. Asserted directly so a
// later "make it prettier" edit that adds loops fails here rather than
// silently breaking the thing the shape exists for.
for (const [name, def] of Object.entries(registry)) {
  if (index[name]?.kind !== 'poison') continue;
  assert(
    effectDurationMs(def) === 400,
    `${name}: poison must last 400ms to fit inside a 1000ms DoT tick, got ${effectDurationMs(def)}`,
  );
}

// Set pieces must NOT have leaked into the matrix (the trap MATRIX_KINDS
// exists to avoid — see registry.ts). If Object.keys(KINDS) ever crept back
// into a matrix-generating loop, each set piece would silently gain 21
// matrix names (7 elements x 3 sizes) and these would fail.
for (const sp of [
  'bolt',
  'smite',
  'rockfall',
  'ring-of-fire',
  'cleave',
  'swordfall',
  'whirlwind',
  'arcane-rain',
  'poison',
]) {
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

// Descents have the cycles axis, and so does cleave (its flurry variants
// reuse the same axis for a different reason — see FRAME_MODE_SHAPES above);
// ring-of-fire does not.
for (const s of shapes) {
  const expected = [
    'setpiece:bolt',
    'setpiece:smite',
    'setpiece:rockfall',
    'setpiece:cleave',
    'setpiece:swordfall',
    'setpiece:arcane-rain',
  ].includes(s.id);
  assert(
    s.hasCycles === expected,
    `${s.id}: hasCycles ${s.hasCycles}, expected ${expected}`,
  );
}

// No cycles leak onto a no-cycles-axis set piece, and no size leaks onto any
// set piece (including with a cycles suffix already applied).
//
// NO_CYCLES_AXIS_SHAPES: every set piece with `hasCycles: false` in
// SET_PIECES — ring-of-fire, whirlwind, and poison. This used to hardcode
// only 'ring-of-fire'; whirlwind (Task 1) and poison (Task 3) share the same
// no-axis property and were unguarded until this list grew to cover them.
const NO_CYCLES_AXIS_SHAPES = ['ring-of-fire', 'whirlwind', 'poison'];
for (const element of Object.keys(ELEMENTS)) {
  for (const suffix of ['x2', 'x3']) {
    for (const sp of NO_CYCLES_AXIS_SHAPES) {
      assert(
        registry[`${sp}-${element}-${suffix}`] === undefined,
        `cycles leaked onto ${sp}: ${element}-${suffix}`,
      );
    }
  }
  for (const sp of [
    'bolt',
    'smite',
    'rockfall',
    'ring-of-fire',
    'cleave',
    'swordfall',
    'whirlwind',
    'arcane-rain',
    'poison',
  ]) {
    for (const suffix of ['sm', 'lg']) {
      assert(
        registry[`${sp}-${element}-${suffix}`] === undefined,
        `size leaked onto a set piece: ${sp}-${element}-${suffix}`,
      );
    }
  }
}

// The loop counts actually differ, or the axis is decorative.
assert(registry['bolt-fire']?.loops === 1, 'bolt-fire must be 1 cycle');
assert(registry['bolt-fire-x2']?.loops === 2, 'bolt-fire-x2 must be 2 cycles');
assert(registry['bolt-fire-x3']?.loops === 3, 'bolt-fire-x3 must be 3 cycles');
// frames/frameMs never move with the axis — only loops does (see registry.ts:
// the first cycle must still complete in frames * frameMs so the first
// impact_vfx lands with the damage number).
assert(
  registry['bolt-fire']?.frames === registry['bolt-fire-x3']?.frames &&
    registry['bolt-fire']?.frameMs === registry['bolt-fire-x3']?.frameMs,
  'cycles must vary loops only, never frames or frameMs',
);

// composeVfxName ignores the axis where absent, and honours it where present.
assert(
  composeVfxName('setpiece:ring-of-fire', 'fire', undefined, 3) ===
    'ring-of-fire-fire',
  'cycles must be ignored for ring-of-fire',
);
assert(
  composeVfxName('setpiece:bolt', 'fire', 'lg', 2) === 'bolt-fire-x2',
  'size must be ignored, cycles honoured, for a descent',
);
// An unknown cycle value must return null, never silently fall back to 1.
// `as CycleKey`, matching the 'toString' as ElementKey pattern above — a
// runtime value that couldn't reach here past the static type, exactly the
// class of input composeVfxName must survive since it may come from
// persisted UI state.
assert(
  composeVfxName('setpiece:bolt', 'fire', undefined, 4 as CycleKey) === null,
  'unknown cycle value must not compose',
);

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
  const round = composeVfxName(
    axes.shapeId,
    axes.element,
    axes.size,
    axes.cycles,
  );
  assert(round === name, `round-trip failed: ${name} -> ${round}`);
}

// Shapes: unique ids, correct axis flags, and a 1:1 relationship with the index.
const shapeIds = shapes.map((s) => s.id);
assert(shapeIds.length === new Set(shapeIds).size, 'shape ids must be unique');
assert(shapes.length === 40, `expected 40 shapes, got ${shapes.length}`);

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
    shape.hasCycles === (axes.cycles !== undefined),
    `${name}: shape.hasCycles=${shape.hasCycles} but cycles=${axes.cycles}`,
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
  // Identifying "is this a ground effect?" by NAME (not by frame identity,
  // e.g. `f === GROUND_FRAME`) only guards ONE direction safely: a future
  // GROUND_FRAME def under some other name fails this assert loudly (its
  // name won't start with 'ring-of-fire-', so `expected` computes `true`
  // while `f.bodyLift` is `false`). It CANNOT catch the opposite mistake —
  // a future ground-level effect wrongly left on SQUARE_FRAME (bodyLift
  // `true`) would compute the same `expected`/`bodyLift` pair as a correct
  // body-centred effect and pass silently. This is a general guard only in
  // the direction that matters for regressions of what already ships; it is
  // not a substitute for reviewing a new set piece's frame choice by hand.
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

// swordfall's PLANTED sword must fit the tall frame's headroom above the
// ground point. Early descent frames deliberately clip at the top — the frame
// edge is the sky the blade falls out of — but once planted the whole sword
// (blade + guard + grip + pommel) has to be on screen or it reads as broken.
assert(
  SWORDFALL_TOTAL_HEIGHT <= TALL_FRAME.groundY,
  `planted swordfall is ${SWORDFALL_TOTAL_HEIGHT} design-px tall but the tall frame only has ${TALL_FRAME.groundY}px above its ground point`,
);

// swordfall's frame 1 — the worst DESCENT frame — must also be fully
// on-screen. The assertion above only proves the PLANTED silhouette fits;
// it says nothing about frames still falling, so raising
// SWORDFALL_START_ABOVE past ~171.4 would silently clip frame 1 with every
// other gate still green.
//
// Frame-1 derivation: frameProgress samples frame midpoints (see its doc
// comment in render.ts), so for a 4-frame cycle frame 1 samples
// progress = (1 + 0.5) / 4 = 0.375. swordfallTip's fall fraction is
// progress / SWORDFALL_LAND_PROGRESS (0.5) = 0.75, and its offset is
// SWORDFALL_START_ABOVE * (1 - fall ** 2) — the same accelerating-descent
// formula as swordfallTip in kinds.ts.
const SWORDFALL_FRAME1_FALL = 0.75;
const swordfallFrame1Above =
  SWORDFALL_START_ABOVE * (1 - SWORDFALL_FRAME1_FALL ** 2);
assert(
  swordfallFrame1Above + SWORDFALL_TOTAL_HEIGHT <= TALL_FRAME.groundY,
  `swordfall frame 1 (the worst descent frame) would clip: offset ${swordfallFrame1Above} + height ${SWORDFALL_TOTAL_HEIGHT} > ${TALL_FRAME.groundY}px of headroom`,
);

// The documented headroom BUDGET for TALL_FRAME (types.ts's TALL_FRAME doc,
// ~line 185-188: "above cy (headroom): 192 available -> budget <= 190")
// is 2px tighter than TALL_FRAME.groundY (192) itself. Guards below compare
// against the budget, not the raw groundY, so they still fail if a shape's
// full painted silhouette eats into that 2px margin.
const TALL_FRAME_HEADROOM_BUDGET = 190;

// The funnel must fit the tall frame's headroom above its ground point, and
// its widest band must fit the frame's half-width. Arithmetic rather than
// measured: there is no node-side canvas, and a value computed from the same
// constants the draw function uses cannot drift from the art.
//
// The vertical check covers the FULL painted silhouette, not just
// WHIRLWIND_HEIGHT: the top band is a flattened ellipse centred at that
// height, so it extends a further half-height above it
// (WHIRLWIND_TOP_HALF_W * WHIRLWIND_BAND_FLATTEN), and whirlwindBands'
// 2px stroke extends half its width beyond the path again. Omitting either
// would let this guard pass a WHIRLWIND_HEIGHT that actually clips the top
// band off-frame.
const WHIRLWIND_STROKE_HALF_WIDTH = 1; // half of whirlwindBands' 2px lineWidth
const whirlwindTopBandHalfHeight =
  WHIRLWIND_TOP_HALF_W * WHIRLWIND_BAND_FLATTEN;
const whirlwindFullHeight =
  WHIRLWIND_HEIGHT + whirlwindTopBandHalfHeight + WHIRLWIND_STROKE_HALF_WIDTH;
assert(
  whirlwindFullHeight <= TALL_FRAME_HEADROOM_BUDGET,
  `whirlwind's full silhouette is ${whirlwindFullHeight} design-px tall (height ${WHIRLWIND_HEIGHT} + top band half-height ${whirlwindTopBandHalfHeight} + stroke half-width ${WHIRLWIND_STROKE_HALF_WIDTH}) but the tall frame's headroom budget is only ${TALL_FRAME_HEADROOM_BUDGET}px`,
);
assert(
  WHIRLWIND_TOP_HALF_W + WHIRLWIND_SWAY <= DESIGN_SIZE / 2,
  `whirlwind's widest band reaches ${WHIRLWIND_TOP_HALF_W + WHIRLWIND_SWAY} design-px, past the frame's ${DESIGN_SIZE / 2}px half-width`,
);

// arcane-rain's motes start ARCANE_START_ABOVE design-px above the ground
// point (at the instant they launch, before any fall) with a
// ARCANE_STREAK_LEN-px motion streak trailing further above that — the same
// "arithmetic, not measured" guard as swordfall/whirlwind above, mirrored so
// a later tweak to either constant fails this gate instead of silently
// clipping the streak off the top of the tall frame. Compared against the
// same TALL_FRAME_HEADROOM_BUDGET as whirlwind above, not the raw groundY.
assert(
  ARCANE_START_ABOVE + ARCANE_STREAK_LEN <= TALL_FRAME_HEADROOM_BUDGET,
  `arcane-rain's motes start ${ARCANE_START_ABOVE} design-px above the ground point plus a ${ARCANE_STREAK_LEN}px streak, but the tall frame's headroom budget is only ${TALL_FRAME_HEADROOM_BUDGET}px`,
);

console.log(
  `vfx-index: ${indexNames.length} names, ${shapes.length} shapes, round-trip OK`,
);

console.log(
  `vfx-kinds: ${KIND_NAMES.size} kinds, front present for all, behind/tint optional`,
);

console.log(`vfx-registry: ${names.length} effects, checks passed`);
