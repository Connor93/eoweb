import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Alternative title theme -- brighter and busier than mfx001. D mixolydian in
 * six, which gives it a lilt the 4/4 original does not have.
 */

const { i, ii, iv, v, vii } = TRIAD;

const PROGRESSION = [
  i,
  i,
  iv,
  iv,
  v,
  v,
  i,
  i,
  i,
  i,
  vii,
  vii,
  iv,
  iv,
  i,
  i,
  ii,
  ii,
  v,
  v,
  iv,
  iv,
  i,
  i,
];

const MELODY = [
  [12, 4, 1, 74],
  [13, 5, 1, 70],
  [14, 6, 2, 78],
  [16, 4, 1, 72],
  [17, 3, 1, 68],
  [18, 2, 3, 74],
  [21, 0, 3, 70],
  [36, 7, 1, 80],
  [37, 6, 1, 72],
  [38, 4, 2, 76],
  [40, 3, 1, 70],
  [41, 2, 1, 68],
  [42, 0, 4, 72],
  [84, 4, 1, 74],
  [85, 6, 1, 72],
  [86, 7, 2, 80],
  [88, 6, 1, 74],
  [89, 4, 1, 70],
  [90, 3, 3, 72],
  [108, 7, 1.5, 78],
  [109.5, 6, 0.5, 70],
  [110, 4, 2, 74],
  [112, 2, 1, 68],
  [113, 0, 3, 70],
];

export default {
  id: 9,
  slug: 'banner',
  title: 'Banner',
  tonic: 62,
  mode: MODES.mixolydian,
  bpm: 96,
  bars: 24,
  beatsPerBar: 6,
  usedBy: 'unassigned -- alternative title theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0xba77e2),
      chords: PROGRESSION,
      pad: { program: 48, volume: 52, velocity: 40 },
      texture: { program: 46, volume: 82, velocity: 52, restChance: 0.24 },
      lead: { program: 73, volume: 88, notes: MELODY },
      drum: {
        volume: 66,
        startBar: 4,
        pattern: [
          { beat: 0, pitch: 41, velocity: 58 },
          { beat: 1.5, pitch: 54, velocity: 30 },
          { beat: 3, pitch: 45, velocity: 48 },
          { beat: 4.5, pitch: 54, velocity: 32 },
        ],
      },
    });
  },
};
