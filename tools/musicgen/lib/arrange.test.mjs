import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrange } from './arrange.mjs';
import { createRng, MODES } from './music.mjs';
import { createScore } from './score.mjs';
import { parseMidi } from './smf-parse.mjs';

const newScore = (bars = 4) =>
  createScore({
    name: 'Test',
    tonic: 62,
    mode: MODES.dorian,
    bpm: 80,
    bars,
    beatsPerBar: 4,
  });

const CHORDS = [
  [-7, -5, -3],
  [-7, -5, -3],
  [-8, -6, -4],
  [-8, -6, -4],
];

test('creates only the voices the spec asks for', () => {
  const score = newScore();

  arrange(score, {
    rng: createRng(1),
    chords: CHORDS,
    pad: { program: 48, volume: 50, velocity: 40 },
  });

  // Conductor plus one pad. A spec with no texture must not silently get one.
  assert.equal(parseMidi(score.toMidi()).tracks.length, 2);
});

test('puts the lead on its own channel, clear of the texture', () => {
  const score = newScore();

  arrange(score, {
    rng: createRng(1),
    chords: CHORDS,
    texture: { program: 46, volume: 80, velocity: 50, noteBeats: 0.5 },
    lead: { program: 74, volume: 86, notes: [[0, 4, 1, 70]] },
  });

  const parsed = parseMidi(score.toMidi());
  const channels = parsed.tracks
    .flat()
    .filter((e) => e.type === 'noteOn')
    .map((e) => e.channel);

  // A lead sharing the texture's channel can collide on a pitch and hang a
  // note -- the bug the hearth track shipped with before the suite caught it.
  assert.ok(channels.includes(1));
  assert.ok(channels.includes(2));
});

test('repeats the drum pattern from the requested bar', () => {
  const score = newScore();

  arrange(score, {
    rng: createRng(1),
    chords: CHORDS,
    drum: {
      volume: 70,
      startBar: 2,
      pattern: [{ beat: 0, pitch: 41, velocity: 60 }],
    },
  });

  const ticks = parseMidi(score.toMidi())
    .tracks.flat()
    .filter((e) => e.type === 'noteOn' && e.channel === 9)
    .map((e) => e.tick);

  assert.deepEqual(ticks, [768, 1152]);
});

test('rejects a progression that does not cover every bar', () => {
  const score = newScore(8);

  // Silent truncation here would leave the back half of the loop harmonically
  // empty, which is hard to hear as a bug and easy to author by accident.
  assert.throws(
    () =>
      arrange(score, {
        rng: createRng(1),
        chords: CHORDS,
        pad: { program: 48 },
      }),
    /chords/,
  );
});
