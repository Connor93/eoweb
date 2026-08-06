// Headless sanity check for the vfx-engine's generated palette. Run via
// `pnpm vfx:check` (tsx, no build step). Must NOT touch the DOM — it never
// calls draw()/renderFrameCanvas(), only inspects the registry's data.
import {
  buildIndex,
  buildRegistry,
  buildShapes,
  composeVfxName,
  DESIGN_SIZE,
  ELEMENTS,
  type ElementKey,
  FRAME_SIZE,
  INTERNAL_SIZE,
  KINDS,
  PIXEL_SCALE,
  RAMP_BASE,
} from '@/vfx-engine';

const KIND_NAMES = new Set(Object.keys(KINDS));

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

assert(names.length >= 150, `expected >= 150 effects, got ${names.length}`);
assert(names.length === new Set(names).size, 'effect names must be unique');

for (const name of names) {
  const def = registry[name];
  assert(KIND_NAMES.has(def.kind), `${name}: unknown kind "${def.kind}"`);
  assert(def.frames > 0, `${name}: frames must be > 0`);
  assert(def.sizeScale > 0, `${name}: sizeScale must be > 0`);
  if (def.combo !== undefined) {
    assert(
      KIND_NAMES.has(def.combo),
      `${name}: unknown combo kind "${def.combo}"`,
    );
  }
}

for (const special of SPECIALS) {
  assert(special in registry, `missing special effect "${special}"`);
}

const index = buildIndex();
const shapes = buildShapes();
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
assert(shapes.length === 31, `expected 31 shapes, got ${shapes.length}`);

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
  composeVfxName('nope:whatever') === null,
  'unknown shape prefix must not compose',
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

console.log(
  `vfx-index: ${indexNames.length} names, ${shapes.length} shapes, round-trip OK`,
);

console.log(`vfx-registry: ${names.length} effects, checks passed`);
