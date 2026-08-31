#!/usr/bin/env node
/**
 * Render every track to public/mfx/mfxNNN.mid.
 *
 * The output is gitignored (public/mfx* is, like every other asset directory)
 * and baked into the Docker image at deploy time. This script is the source of
 * truth -- the .mid files are build output, so regenerating them is always
 * safe and always produces identical bytes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTrack } from './lib/render.mjs';
import { TRACKS } from './tracks/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'public', 'mfx');

mkdirSync(outDir, { recursive: true });

const rows = [];
for (const track of TRACKS) {
  const score = renderTrack(track);
  const bytes = score.toMidi();
  const file = `mfx${String(track.id).padStart(3, '0')}.mid`;

  writeFileSync(join(outDir, file), bytes);

  const beats = track.bars * (track.beatsPerBar ?? 4);
  rows.push({
    file,
    title: track.title,
    bpm: track.bpm,
    bars: track.bars,
    loop: `${((beats / track.bpm) * 60).toFixed(1)}s`,
    bytes: bytes.length,
    usedBy: track.usedBy,
  });
}

console.table(rows);
console.log(`\nWrote ${rows.length} tracks to ${outDir}`);
