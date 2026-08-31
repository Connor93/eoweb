import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arpeggio, drone, pulse } from './figures.mjs';
import { createRng, MODES } from './music.mjs';
import { createScore, TICKS_PER_BEAT } from './score.mjs';
import { parseMidi } from './smf-parse.mjs';

const newScore = () =>
  createScore({
    name: 'Test',
    tonic: 62,
    mode: MODES.dorian,
    bpm: 80,
    bars: 4,
    beatsPerBar: 4,
  });

const notesOf = (score) =>
  parseMidi(score.toMidi())
    .tracks.flat()
    .filter((event) => event.type === 'noteOn');

test('drone re-attacks once per bar', () => {
  const score = newScore();
  const part = score.part({ name: 'Strings', channel: 0, program: 48 });

  drone(part, { bars: 4, beatsPerBar: 4, degrees: [0], velocity: 50 });

  const ticks = notesOf(score).map((n) => n.tick);
  // Re-attacking every bar is what makes the loop seam inaudible: bar 1 of the
  // repeat sounds exactly like every other bar rather than a sudden restart.
  assert.deepEqual(ticks, [0, 384, 768, 1152]);
});

test('drone spanning the whole score stays inside the loop', () => {
  const score = newScore();
  const part = score.part({ name: 'Strings', channel: 0, program: 48 });

  assert.doesNotThrow(() =>
    drone(part, { bars: 4, beatsPerBar: 4, degrees: [0, 4], velocity: 50 }),
  );
});

test('arpeggio only sounds the degrees it was given', () => {
  const score = newScore();
  const part = score.part({ name: 'Harp', channel: 0, program: 46 });

  arpeggio(part, {
    bars: 4,
    beatsPerBar: 4,
    degrees: [0, 2, 4],
    noteBeats: 0.5,
    velocity: 60,
    rng: createRng(7),
  });

  // Degrees 0/2/4 of D dorian are D, F and A in some octave.
  const classes = new Set(notesOf(score).map((n) => n.pitch % 12));
  assert.deepEqual(
    [...classes].sort((a, b) => a - b),
    [2, 5, 9],
  );
});

test('arpeggio reproduces itself for a given seed', () => {
  const render = () => {
    const score = newScore();
    const part = score.part({ name: 'Harp', channel: 0, program: 46 });
    arpeggio(part, {
      bars: 4,
      beatsPerBar: 4,
      degrees: [0, 2, 4],
      noteBeats: 0.5,
      velocity: 60,
      restChance: 0.3,
      rng: createRng(42),
    });
    return score.toMidi();
  };

  assert.deepEqual(render(), render());
});

test('pulse repeats a percussion pattern every bar', () => {
  const score = newScore();
  const part = score.part({ name: 'Drum', channel: 9 });

  pulse(part, {
    bars: 4,
    beatsPerBar: 4,
    pattern: [{ beat: 0, pitch: 41, velocity: 70 }],
  });

  const ticks = notesOf(score).map((n) => n.tick);
  assert.deepEqual(ticks, [
    0,
    4 * TICKS_PER_BEAT,
    8 * TICKS_PER_BEAT,
    12 * TICKS_PER_BEAT,
  ]);
});
