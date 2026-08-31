import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng, inMode, MODES, pitchOf, TRIAD } from './music.mjs';

const D4 = 62;

test('walks a dorian scale up an octave', () => {
  const degrees = [0, 1, 2, 3, 4, 5, 6, 7];

  const pitches = degrees.map((degree) => pitchOf(D4, MODES.dorian, degree));

  // D E F G A B C D -- the raised sixth (B natural) is what separates
  // dorian from aeolian, and it is the whole reason this mode was chosen.
  assert.deepEqual(pitches, [62, 64, 65, 67, 69, 71, 72, 74]);
});

test('walks below the tonic for negative degrees', () => {
  assert.equal(pitchOf(D4, MODES.dorian, -1), 60);
  assert.equal(pitchOf(D4, MODES.dorian, -7), 50);
});

test('distinguishes phrygian from aeolian at the second degree', () => {
  // The flat second is the entire character of the dungeon track.
  assert.equal(pitchOf(D4, MODES.phrygian, 1), 63);
  assert.equal(pitchOf(D4, MODES.aeolian, 1), 64);
});

test('recognises pitches belonging to a mode in any octave', () => {
  assert.ok(inMode(62 + 12, D4, MODES.dorian));
  assert.ok(inMode(71, D4, MODES.dorian));
  assert.ok(!inMode(63, D4, MODES.dorian));
});

test('produces the same sequence for the same seed', () => {
  const first = Array.from({ length: 8 }, () => createRng(1234).next());
  const second = createRng(1234);

  assert.deepEqual(first[0], second.next());
});

test('produces different sequences for different seeds', () => {
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('keeps integer draws inside an inclusive range', () => {
  const rng = createRng(99);

  const draws = Array.from({ length: 500 }, () => rng.int(1, 6));

  assert.ok(draws.every((d) => Number.isInteger(d) && d >= 1 && d <= 6));
  assert.equal(new Set(draws).size, 6, 'every face of the range should appear');
});

test('resolves triad shapes diatonically against the mode', () => {
  assert.deepEqual(
    TRIAD.i.map((d) => pitchOf(D4, MODES.dorian, d)),
    [50, 53, 57],
  );
  // Dorian's major IV is the mode's signature chord -- the raised sixth is
  // what makes it major where aeolian's would be minor.
  assert.deepEqual(
    TRIAD.iv.map((d) => pitchOf(D4, MODES.dorian, d)),
    [55, 59, 62],
  );
});
