import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODES } from './music.mjs';
import { createScore, TICKS_PER_BEAT } from './score.mjs';
import { parseMidi } from './smf-parse.mjs';

const newScore = (overrides = {}) =>
  createScore({
    name: 'Test',
    tonic: 62,
    mode: MODES.dorian,
    bpm: 84,
    bars: 8,
    beatsPerBar: 4,
    ...overrides,
  });

test('ends exactly on the declared bar count', () => {
  const score = newScore();
  score.part({ name: 'Harp', channel: 0, program: 46 }).note(0, 0, 1, 80);

  const parsed = parseMidi(score.toMidi());
  const end = parsed.tracks.flat().find((event) => event.type === 'endOfTrack');

  // 8 bars * 4 beats * 96 ticks. A loop that ends anywhere else turns over
  // early or late, and the seam is audible every single repeat.
  assert.equal(score.lengthTicks, 8 * 4 * TICKS_PER_BEAT);
  assert.equal(end.tick, 8 * 4 * TICKS_PER_BEAT);
});

test('resolves scale degrees through the score mode', () => {
  const score = newScore();
  score.part({ name: 'Harp', channel: 0, program: 46 }).note(0, 4, 1, 80);

  const parsed = parseMidi(score.toMidi());
  const noteOn = parsed.tracks.flat().find((e) => e.type === 'noteOn');

  // Degree 4 of D dorian is A4.
  assert.equal(noteOn.pitch, 69);
});

test('rejects a note that sustains past the loop point', () => {
  const score = newScore();
  const harp = score.part({ name: 'Harp', channel: 0, program: 46 });

  // Starts on the final beat and runs two beats long.
  assert.throws(() => harp.note(31, 0, 2, 80), /loop/i);
});

test('allows a note that releases exactly on the loop point', () => {
  const score = newScore();
  const harp = score.part({ name: 'Harp', channel: 0, program: 46 });

  assert.doesNotThrow(() => harp.note(31, 0, 1, 80));
});

test('emits tempo and time signature once, on the conductor track', () => {
  const score = newScore({ bpm: 84, beatsPerBar: 6 });
  score.part({ name: 'Harp', channel: 0, program: 46 }).note(0, 0, 1, 80);

  const parsed = parseMidi(score.toMidi());
  const conductor = parsed.tracks[0];

  assert.equal(conductor.filter((e) => e.type === 'tempo').length, 1);
  assert.equal(conductor[0].type, 'trackName');
  // Tempo is stored as microseconds per quarter note, so 84bpm round-trips
  // as 83.99997 -- a resolution limit of the format, not a rounding bug.
  assert.ok(
    Math.abs(conductor.find((e) => e.type === 'tempo').bpm - 84) < 0.001,
  );
  assert.equal(conductor.find((e) => e.type === 'timeSignature').numerator, 6);
});

test('emits program and volume for each part', () => {
  const score = newScore();
  score
    .part({ name: 'Harp', channel: 2, program: 46, volume: 90 })
    .note(0, 0, 1, 80);

  const parsed = parseMidi(score.toMidi());
  const part = parsed.tracks[1];

  assert.equal(part.find((e) => e.type === 'program').program, 46);
  assert.equal(
    part.find((e) => e.type === 'controller' && e.cc === 7).value,
    90,
  );
  assert.equal(part.find((e) => e.type === 'noteOn').channel, 2);
});

test('places percussion by absolute pitch on channel 9', () => {
  const score = newScore();
  const drum = score.part({ name: 'Drum', channel: 9, percussion: true });

  drum.hit(0, 35, 1, 90);

  const parsed = parseMidi(score.toMidi());
  const noteOn = parsed.tracks[1].find((e) => e.type === 'noteOn');

  // Percussion pitches are instrument selectors, not scale degrees, so they
  // must bypass the mode resolver entirely.
  assert.equal(noteOn.pitch, 35);
  assert.equal(noteOn.channel, 9);
});

test('scales part volume and note velocity by the score gain', () => {
  const score = newScore({ gain: 2 });
  score
    .part({ name: 'Harp', channel: 0, program: 46, volume: 50 })
    .note(0, 0, 1, 40);

  const parsed = parseMidi(score.toMidi());
  const part = parsed.tracks[1];

  assert.equal(
    part.find((e) => e.type === 'controller' && e.cc === 7).value,
    100,
  );
  assert.equal(part.find((e) => e.type === 'noteOn').velocity, 80);
});

test('clamps gained volume and velocity to the MIDI maximum', () => {
  const score = newScore({ gain: 4 });
  score
    .part({ name: 'Harp', channel: 0, program: 46, volume: 100 })
    .note(0, 0, 1, 100);

  const parsed = parseMidi(score.toMidi());
  const part = parsed.tracks[1];

  assert.equal(
    part.find((e) => e.type === 'controller' && e.cc === 7).value,
    127,
  );
  assert.equal(part.find((e) => e.type === 'noteOn').velocity, 127);
});
