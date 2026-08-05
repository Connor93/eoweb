// Headless sanity check for the vfx-engine's generated palette. Run via
// `pnpm vfx:check` (tsx, no build step). Must NOT touch the DOM — it never
// calls draw()/renderFrameCanvas(), only inspects the registry's data.
import { buildRegistry, KINDS } from '@/vfx-engine';

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

console.log(`vfx-registry: ${names.length} effects, checks passed`);
