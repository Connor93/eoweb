// Cross-repo registry parity check. Complements sync-vfx-engine.sh --check
// (which diffs the vendored *files*): this script diffs what those files
// actually *produce* by calling buildRegistry() in both eoweb (canonical)
// and aio-editor (vendored) and asserting the key sets are identical — not
// just equal in count, which would miss a rename (e.g. `nova-fire` renamed
// to `nova-fire-mid` in one repo but not the other, same total either way).
// Run via `pnpm vfx:parity` (tsx, no build step). Must NOT touch the DOM —
// only inspects registry data, same constraint as vfx-registry-check.ts.
//
// Usage: tsx scripts/vfx-registry-parity-check.ts [AIO_EDITOR_DIR]
//   AIO_EDITOR_DIR defaults to $AIO_EDITOR_DIR env, else ../aio-editor next
//   to this repo checkout — same resolution order as sync-vfx-engine.sh.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { VfxDef } from '@/vfx-engine';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`vfx-registry-parity-check: ${message}`);
  }
}

const EOWEB_DIR = path.resolve(import.meta.dirname, '..');
const AIO_EDITOR_DIR = path.resolve(
  process.argv[2] ??
    process.env.AIO_EDITOR_DIR ??
    path.join(EOWEB_DIR, '..', 'aio-editor'),
);
const AIO_ENGINE_INDEX = path.join(
  AIO_EDITOR_DIR,
  'packages/frontend/src/vfx-engine/index.ts',
);

if (!existsSync(AIO_ENGINE_INDEX)) {
  // VFX_PARITY_OPTIONAL=1 (set by `pnpm vfx:parity:optional`, which the
  // lefthook pre-commit hook runs) downgrades "no sibling checkout" from an
  // error to a skip — a missing SIBLING repo must never block a commit in
  // this one, and GitHub Actions never has one. Unset, it stays a hard
  // failure so an explicit `pnpm vfx:parity` still means something.
  if (process.env.VFX_PARITY_OPTIONAL === '1') {
    console.log(
      `vfx-registry-parity: SKIPPED (no vendored engine at ${AIO_ENGINE_INDEX})`,
    );
    process.exit(0);
  }
  console.error(
    `vfx-registry-parity-check: vendored engine not found at ${AIO_ENGINE_INDEX}. Run eoweb/scripts/sync-vfx-engine.sh first.`,
  );
  process.exit(1);
}

const { buildRegistry: buildRegistryEoweb } = await import('@/vfx-engine');
// Loaded by absolute file URL, NOT the `@/vfx-engine` alias — that alias is
// only meaningful inside eoweb's own tsconfig, and the whole point here is
// to exercise the vendored copy exactly as aio-editor imports it (relative
// paths only, no alias).
const { buildRegistry: buildRegistryAio } = (await import(
  pathToFileURL(AIO_ENGINE_INDEX).href
)) as { buildRegistry(): Record<string, VfxDef> };

const eowebKeys = new Set(Object.keys(buildRegistryEoweb()));
const aioKeys = new Set(Object.keys(buildRegistryAio()));

const onlyInEoweb = [...eowebKeys].filter((k) => !aioKeys.has(k)).sort();
const onlyInAio = [...aioKeys].filter((k) => !eowebKeys.has(k)).sort();

assert(
  eowebKeys.size === aioKeys.size,
  `key count mismatch: eoweb has ${eowebKeys.size}, aio-editor has ${aioKeys.size}`,
);
assert(
  onlyInEoweb.length === 0,
  `${onlyInEoweb.length} key(s) present in eoweb but missing from aio-editor's registry: ${onlyInEoweb.join(', ')}`,
);
assert(
  onlyInAio.length === 0,
  `${onlyInAio.length} key(s) present in aio-editor but missing from eoweb's registry (stale/renamed): ${onlyInAio.join(', ')}`,
);

console.log(
  `vfx-registry-parity: ${eowebKeys.size} effects, eoweb registry keys === aio-editor registry keys`,
);
