import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Open country in three. Faster and more driving than mfx004 -- a fiddle over
 * a walking waltz, for the long crossings between towns.
 */

const { i, ii, iv, v, vii } = TRIAD;

const PROGRESSION = [
  i,
  i,
  vii,
  vii,
  iv,
  iv,
  i,
  i,
  i,
  i,
  v,
  v,
  vii,
  vii,
  i,
  i,
  iv,
  iv,
  i,
  i,
  ii,
  ii,
  v,
  v,
  i,
  vii,
  iv,
  i,
  i,
  i,
];

const MELODY = [
  [12, 4, 1, 72],
  [13, 5, 1, 68],
  [14, 4, 1, 70],
  [15, 2, 2, 74],
  [17, 0, 1, 66],
  [18, 2, 1, 70],
  [19, 4, 1, 72],
  [20, 3, 2, 70],
  [22, 2, 2, 68],
  [42, 7, 1, 78],
  [43, 6, 1, 72],
  [44, 4, 1, 74],
  [45, 3, 2, 72],
  [47, 2, 1, 68],
  [48, 4, 1, 72],
  [49, 6, 1, 74],
  [50, 7, 2, 78],
  [52, 4, 2, 72],
  [72, 2, 1, 70],
  [73, 3, 1, 68],
  [74, 4, 2, 72],
  [76, 2, 1, 68],
  [77, 0, 3, 70],
];

export default {
  id: 14,
  slug: 'longroad',
  title: 'Long Road',
  tonic: 57,
  mode: MODES.mixolydian,
  bpm: 104,
  bars: 30,
  beatsPerBar: 3,
  usedBy: 'unassigned -- alternative open-country theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x102924),
      chords: PROGRESSION,
      pad: { program: 48, volume: 48, velocity: 38 },
      texture: { program: 46, volume: 76, velocity: 48, restChance: 0.28 },
      lead: { program: 110, volume: 84, notes: MELODY },
      drum: {
        volume: 64,
        startBar: 6,
        pattern: [
          { beat: 0, pitch: 41, velocity: 60 },
          { beat: 1, pitch: 42, velocity: 32 },
          { beat: 2, pitch: 45, velocity: 44 },
        ],
      },
    });
  },
};
