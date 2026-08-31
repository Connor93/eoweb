#!/usr/bin/env node
/**
 * Render tracks to WAV so they can be auditioned without launching the game.
 *
 * This drives spessasynth_core with public/TimGM6mb.sf2 -- the exact synth and
 * soundfont the client uses -- so a preview sounds like what a player hears
 * rather than like whatever a general MIDI renderer decides.
 *
 * Two loops are rendered back to back by default: the seam between repeat 1
 * and repeat 2 is the thing most worth listening for, and it is inaudible in a
 * single pass.
 *
 *   node tools/musicgen/preview.mjs             # every track
 *   node tools/musicgen/preview.mjs title town  # just these
 *   node tools/musicgen/preview.mjs --loops=1 --out=/tmp/mfx
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTrack } from './lib/render.mjs';
import { TRACKS } from './tracks/index.mjs';

const SAMPLE_RATE = 44100;
const BLOCK_SIZE = 128;
const TAIL_SECONDS = 1.5;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

/**
 * spessasynth_core is a transitive dependency, so pnpm does not hoist it to
 * the root node_modules. Resolving it out of the store keeps the preview tool
 * from needing a package.json entry of its own -- and keeps knip, which only
 * scans .ts files, from reporting that entry as unused.
 */
function resolveCore() {
  const store = join(repoRoot, 'node_modules', '.pnpm');
  const match = readdirSync(store).find((entry) =>
    entry.startsWith('spessasynth_core@'),
  );
  if (!match) {
    throw new Error(
      'spessasynth_core not found in node_modules/.pnpm -- run `pnpm install` first',
    );
  }
  return join(
    store,
    match,
    'node_modules',
    'spessasynth_core',
    'dist',
    'index.js',
  );
}

/** 16-bit stereo PCM WAV. */
function encodeWav(left, right, sampleRate) {
  const frames = left.length;
  const dataBytes = frames * 4;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let frame = 0; frame < frames; frame += 1) {
    const l = Math.max(-1, Math.min(1, left[frame]));
    const r = Math.max(-1, Math.min(1, right[frame]));
    buffer.writeInt16LE(Math.round(l * 32767), 44 + frame * 4);
    buffer.writeInt16LE(Math.round(r * 32767), 46 + frame * 4);
  }

  return buffer;
}

async function main() {
  const args = process.argv.slice(2);
  const loops = Number(
    args.find((a) => a.startsWith('--loops='))?.split('=')[1] ?? 2,
  );
  const outDir =
    args.find((a) => a.startsWith('--out='))?.split('=')[1] ??
    join(here, '.preview');
  const wanted = args.filter((a) => !a.startsWith('--'));

  const core = await import(resolveCore());
  const {
    BasicMIDI,
    SoundBankLoader,
    SpessaSynthProcessor,
    SpessaSynthSequencer,
  } = core;

  const soundFont = readFileSync(join(repoRoot, 'public', 'TimGM6mb.sf2'));
  mkdirSync(outDir, { recursive: true });

  const selected = wanted.length
    ? TRACKS.filter((t) => wanted.includes(t.slug))
    : TRACKS;

  if (!selected.length) {
    throw new Error(`no tracks matched: ${wanted.join(', ')}`);
  }

  for (const track of selected) {
    const score = renderTrack(track);
    const midi = score.toMidi();

    const processor = new SpessaSynthProcessor(SAMPLE_RATE);
    await processor.processorInitialized;
    processor.soundBankManager.addSoundBank(
      SoundBankLoader.fromArrayBuffer(
        soundFont.buffer.slice(
          soundFont.byteOffset,
          soundFont.byteOffset + soundFont.byteLength,
        ),
      ),
      'main',
    );

    const sequencer = new SpessaSynthSequencer(processor);
    sequencer.skipToFirstNoteOn = false;
    sequencer.loopCount = loops - 1;
    sequencer.loadNewSongList([
      BasicMIDI.fromArrayBuffer(
        midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength),
      ),
    ]);
    sequencer.play();

    const beats = track.bars * (track.beatsPerBar ?? 4);
    const loopSeconds = (beats / track.bpm) * 60;
    const totalSamples = Math.ceil(
      (loopSeconds * loops + TAIL_SECONDS) * SAMPLE_RATE,
    );

    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);
    const blockLeft = new Float32Array(BLOCK_SIZE);
    const blockRight = new Float32Array(BLOCK_SIZE);

    for (let offset = 0; offset < totalSamples; offset += BLOCK_SIZE) {
      sequencer.processTick();
      blockLeft.fill(0);
      blockRight.fill(0);
      processor.process(blockLeft, blockRight, 0, BLOCK_SIZE);

      const count = Math.min(BLOCK_SIZE, totalSamples - offset);
      left.set(blockLeft.subarray(0, count), offset);
      right.set(blockRight.subarray(0, count), offset);
    }

    const peak = left.reduce(
      (max, sample, index) =>
        Math.max(max, Math.abs(sample), Math.abs(right[index])),
      0,
    );

    const file = join(
      outDir,
      `${String(track.id).padStart(3, '0')}-${track.slug}.wav`,
    );
    writeFileSync(file, encodeWav(left, right, SAMPLE_RATE));

    console.log(
      `${track.slug.padEnd(11)} ${(loopSeconds * loops).toFixed(1)}s  peak ${peak.toFixed(3)}  ${file}`,
    );
  }
}

await main();
