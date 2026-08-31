import { arpeggio, drone } from '../lib/figures.mjs';
import { createRng, MODES } from '../lib/music.mjs';

/**
 * Title screen. D dorian.
 *
 * The one track that needs a tune: it plays on the login screen where a
 * player is reading rather than grinding, so it carries a full melody where
 * the world tracks stay sparse. The raised sixth (B natural) in bar 3 is the
 * mode announcing itself -- it is what stops this reading as plain D minor.
 */

// D3 F3 A3 / C3 E3 G3 / G3 B3 D4 -- i, VII and the bright dorian IV.
const CHORD_I = [-7, -5, -3];
const CHORD_VII = [-8, -6, -4];
const CHORD_IV = [-4, -2, 0];

const PROGRESSION = [
  CHORD_I,
  CHORD_I,
  CHORD_VII,
  CHORD_VII,
  CHORD_IV,
  CHORD_IV,
  CHORD_I,
  CHORD_I,
  CHORD_I,
  CHORD_I,
  CHORD_VII,
  CHORD_VII,
  CHORD_IV,
  CHORD_IV,
  CHORD_I,
  CHORD_I,
];

/** [beat, degree, duration, velocity] */
const MELODY = [
  // Phrase A -- rises to the fifth, falls back. Bars 3-6.
  [8, 4, 1.5, 74],
  [9.5, 5, 0.5, 68],
  [10, 6, 2, 76],
  [13, 4, 1, 70],
  [14, 3, 2, 72],
  [16, 2, 1.5, 74],
  [17.5, 3, 0.5, 68],
  [18, 4, 2, 78],
  [21, 2, 1, 70],
  [22, 0, 2, 72],
  // Bars 7-8 are silent: the harp carries the turn.
  // Phrase B -- the same shape an octave up, opened out. Bars 9-12.
  [32, 7, 1.5, 80],
  [33.5, 6, 0.5, 72],
  [34, 5, 2, 78],
  [37, 4, 1, 72],
  [38, 6, 2, 76],
  [40, 7, 1.5, 82],
  [41.5, 8, 0.5, 74],
  [42, 9, 2, 80],
  [45, 7, 1, 74],
  [46, 6, 2, 74],
  // Tail -- settles onto the tonic. Bars 13-14.
  [48, 4, 2, 74],
  [51, 3, 1, 68],
  [52, 2, 2, 72],
  [55, 0, 1, 66],
];

export default {
  id: 1,
  slug: 'title',
  title: 'Title',
  tonic: 62,
  mode: MODES.dorian,
  bpm: 72,
  bars: 16,
  usedBy: 'Login and character-select screens',

  compose(score) {
    const rng = createRng(0x71713);

    const strings = score.part({
      name: 'Strings',
      channel: 0,
      program: 48,
      volume: 58,
      reverb: 96,
    });
    const harp = score.part({
      name: 'Harp',
      channel: 1,
      program: 46,
      volume: 82,
      reverb: 78,
    });
    const recorder = score.part({
      name: 'Recorder',
      channel: 2,
      program: 74,
      volume: 90,
      reverb: 70,
    });

    PROGRESSION.forEach((chord, bar) => {
      drone(strings, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord,
        velocity: 46,
        gapBeats: 0.25,
      });

      arpeggio(harp, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        // An octave above the drone, so the harp sits between bass and tune.
        degrees: chord.map((degree) => degree + 7),
        noteBeats: 0.5,
        velocity: 54,
        velocityJitter: 6,
        restChance: 0.22,
        octaves: [0, 0, 1],
        rng,
      });
    });

    for (const [beat, degree, duration, velocity] of MELODY) {
      recorder.note(beat, degree, duration, velocity);
    }
  },
};
