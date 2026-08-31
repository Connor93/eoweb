import { arpeggio, drone } from '../lib/figures.mjs';
import { createRng, MODES } from '../lib/music.mjs';

/**
 * Western Docks. D mixolydian.
 *
 * The airiest track: flute high in its range over a harp that never fills the
 * bar, so there is space left for the map's own ambient water loop to sit in.
 */

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
  CHORD_IV,
  CHORD_IV,
  CHORD_VII,
  CHORD_VII,
  CHORD_I,
  CHORD_I,
];

const MELODY = [
  [16, 4, 2, 70],
  [19, 6, 1, 66],
  [20, 7, 2, 74],
  [23, 5, 1, 66],
  [24, 4, 2, 70],
  [48, 7, 2, 74],
  [51, 6, 1, 68],
  [52, 4, 2, 70],
  [55, 2, 1, 64],
  [56, 0, 2, 66],
];

export default {
  id: 7,
  slug: 'coast',
  title: 'Coast',
  tonic: 62,
  mode: MODES.mixolydian,
  bpm: 80,
  bars: 16,
  usedBy: 'Western Docks',

  compose(score) {
    const rng = createRng(0xc0a5);

    const strings = score.part({
      name: 'Strings',
      channel: 0,
      program: 48,
      volume: 46,
      reverb: 96,
    });
    const harp = score.part({
      name: 'Harp',
      channel: 1,
      program: 46,
      volume: 76,
      reverb: 80,
    });
    const flute = score.part({
      name: 'Flute',
      channel: 2,
      program: 73,
      volume: 82,
      reverb: 74,
    });

    PROGRESSION.forEach((chord, bar) => {
      drone(strings, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord,
        velocity: 36,
        gapBeats: 0.5,
      });
      arpeggio(harp, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord.map((degree) => degree + 7),
        noteBeats: 0.5,
        velocity: 46,
        velocityJitter: 6,
        restChance: 0.42,
        octaves: [0, 1, 1],
        rng,
      });
    });

    for (const [beat, degree, duration, velocity] of MELODY) {
      flute.note(beat, degree, duration, velocity);
    }
  },
};
