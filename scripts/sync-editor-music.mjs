#!/usr/bin/env node
/**
 * Vendors the musicgen track list into the eomap-js fork, so the map editor's
 * Map Properties dialog can offer Music as a named dropdown instead of a bare
 * id. Map music is set live through that editor, so the list needs to be there
 * rather than here.
 *
 * The generated module is derived entirely from tools/musicgen/tracks/, which
 * stays the single source of truth. Do NOT hand-edit the destination; fix a
 * track here and re-run this.
 *
 * Usage: scripts/sync-editor-music.mjs [EOMAP_DIR]
 *   EOMAP_DIR defaults to $EOMAP_DIR, else ../eomap-js-origin next to this
 *   repo checkout.
 *
 * Usage: scripts/sync-editor-music.mjs --check [EOMAP_DIR]
 *   Read-only parity guard. Exits 1 if the vendored copy has drifted.
 *
 * Add --optional to exit 0 when the sibling checkout is absent, so a missing
 * neighbouring repo never fails someone's build.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEditorModule } from '../tools/musicgen/lib/editor-manifest.mjs';
import { TRACKS } from '../tools/musicgen/tracks/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const args = process.argv.slice(2);
const check = args.includes('--check');
const optional = args.includes('--optional');
const target = args.find((a) => !a.startsWith('--'));

const eomapDir = resolve(
  target ?? process.env.EOMAP_DIR ?? join(repoRoot, '..', 'eomap-js-origin'),
);

if (!existsSync(eomapDir)) {
  if (optional) {
    console.log(`skipped: no eomap-js checkout at ${eomapDir}`);
    process.exit(0);
  }
  console.error(`no eomap-js checkout at ${eomapDir}`);
  process.exit(1);
}

const destDir = join(eomapDir, 'src', 'core', 'data');
const dest = join(destDir, 'music-tracks.js');
const expected = renderEditorModule(TRACKS);

if (check) {
  const actual = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
  if (actual === expected) {
    console.log(`music-tracks.js is in sync (${TRACKS.length} tracks)`);
    process.exit(0);
  }
  console.error(
    actual === null
      ? `music-tracks.js has never been synced to ${dest}`
      : 'music-tracks.js has drifted from tools/musicgen/tracks/ -- re-run scripts/sync-editor-music.mjs',
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
writeFileSync(dest, expected);
console.log(`wrote ${TRACKS.length} tracks to ${dest}`);
