import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Town alternative: a waltz. G ionian, three beats to the bar and the fastest
 * tempo in the town set -- for a market square rather than a quiet street.
 */

const { i, ii, iv, v, vi } = TRIAD;

const PROGRESSION = [
  i,
  i,
  iv,
  v,
  i,
  i,
  v,
  i,
  vi,
  vi,
  ii,
  v,
  i,
  i,
  v,
  i,
  i,
  i,
  iv,
  iv,
  ii,
  ii,
  v,
  v,
  i,
  vi,
  ii,
  v,
  i,
  i,
  v,
  i,
];

const MELODY = [
  [12, 2, 1, 72],
  [13, 4, 1, 70],
  [14, 3, 1, 68],
  [15, 2, 2, 74],
  [17, 0, 1, 66],
  [18, 4, 1, 72],
  [19, 3, 1, 68],
  [20, 2, 2, 70],
  [22, 0, 2, 68],
  [48, 4, 1, 74],
  [49, 5, 1, 70],
  [50, 6, 1, 72],
  [51, 7, 2, 78],
  [53, 5, 1, 70],
  [54, 4, 1, 72],
  [55, 2, 2, 70],
  [57, 0, 2, 68],
  [78, 2, 1, 70],
  [79, 3, 1, 68],
  [80, 4, 2, 74],
  [82, 2, 1, 68],
  [83, 0, 2, 70],
];

export default {
  id: 10,
  slug: 'market',
  title: 'Market',
  tonic: 55,
  mode: MODES.ionian,
  bpm: 112,
  bars: 32,
  beatsPerBar: 3,
  usedBy: 'unassigned -- alternative town theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x4a2ce7),
      chords: PROGRESSION,
      pad: { program: 48, volume: 46, velocity: 36 },
      texture: { program: 24, volume: 80, velocity: 52, restChance: 0.2 },
      lead: { program: 110, volume: 84, notes: MELODY },
      drum: {
        volume: 62,
        startBar: 4,
        pattern: [
          { beat: 0, pitch: 41, velocity: 58 },
          { beat: 1, pitch: 69, velocity: 30 },
          { beat: 2, pitch: 69, velocity: 32 },
        ],
      },
    });
  },
};
