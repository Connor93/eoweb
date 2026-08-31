/**
 * Modal composition vocabulary.
 *
 * Deliberately small: it resolves scale degrees to MIDI pitches and supplies a
 * seeded RNG. The tunes themselves are hand-written in tracks/ -- this module
 * exists so a track can say "degree 4 of D dorian" instead of "pitch 69", and
 * so the mechanical texture (arpeggio figuration, drum fills) reproduces
 * byte-for-byte on every build.
 */

/** Semitone offsets from the tonic, one entry per scale degree. */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

const DEGREES_PER_OCTAVE = 7;

/**
 * Triads by scale degree, in degree space rather than semitones.
 *
 * Because they are expressed as degrees, each shape resolves diatonically
 * against whatever mode the score declares: TRIAD.iv is major in dorian and
 * minor in aeolian without the caller doing anything. Voiced low, roughly an
 * octave below the tonic, which is where a sustained pad wants to sit.
 */
export const TRIAD = {
  i: [-7, -5, -3],
  ii: [-6, -4, -2],
  iii: [-5, -3, -1],
  iv: [-4, -2, 0],
  v: [-3, -1, 1],
  vi: [-9, -7, -5],
  vii: [-8, -6, -4],
};

/**
 * Resolve a scale degree to a MIDI pitch. Degrees run past both ends of the
 * octave -- degree 7 is the tonic an octave up, degree -1 the seventh below --
 * so a melody can be written as one unbroken run of numbers.
 */
export function pitchOf(tonic, mode, degree) {
  const octave = Math.floor(degree / DEGREES_PER_OCTAVE);
  const index =
    ((degree % DEGREES_PER_OCTAVE) + DEGREES_PER_OCTAVE) % DEGREES_PER_OCTAVE;
  return tonic + octave * 12 + mode[index];
}

/** True when a pitch belongs to the mode, in any octave. */
export function inMode(pitch, tonic, mode) {
  const pitchClass = (((pitch - tonic) % 12) + 12) % 12;
  return mode.includes(pitchClass);
}

/**
 * Seeded xorshift32. Every build must reproduce identical bytes, so nothing in
 * the generator may reach for Math.random().
 */
export function createRng(seed) {
  let state = seed >>> 0 || 0x9e3779b9;

  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };

  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    chance(probability) {
      return next() < probability;
    },
  };
}
