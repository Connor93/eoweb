import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * The brightest and fastest thing in the set: G ionian at 126, straight major,
 * with a kit pattern rather than a hand drum. Deliberately un-modal, as a
 * counterweight to everything else here.
 */

const { i, iv, v, vi } = TRIAD;

const PROGRESSION = [
  i,
  i,
  v,
  v,
  vi,
  vi,
  iv,
  iv,
  i,
  i,
  v,
  v,
  iv,
  iv,
  i,
  i,
  i,
  i,
  iv,
  iv,
  v,
  v,
  vi,
  vi,
  iv,
  iv,
  v,
  v,
  i,
  i,
  i,
  i,
];

const MELODY = [
  [16, 4, 1, 74],
  [17, 5, 0.5, 68],
  [17.5, 6, 0.5, 70],
  [18, 7, 2, 78],
  [20, 6, 1, 72],
  [21, 4, 1, 70],
  [22, 2, 2, 72],
  [24, 0, 1, 68],
  [25, 2, 1, 70],
  [26, 4, 2, 74],
  [28, 3, 1, 68],
  [29, 2, 1, 66],
  [30, 0, 2, 70],
  [80, 7, 1, 78],
  [81, 6, 0.5, 70],
  [81.5, 5, 0.5, 68],
  [82, 4, 2, 74],
  [84, 6, 1, 72],
  [85, 7, 1, 76],
  [86, 4, 2, 72],
  [88, 2, 1, 68],
  [89, 4, 1, 72],
  [90, 6, 2, 76],
  [92, 4, 1, 70],
  [93, 2, 1, 68],
  [94, 0, 2, 72],
];

export default {
  id: 15,
  slug: 'sunfields',
  title: 'Sunfields',
  tonic: 55,
  mode: MODES.ionian,
  bpm: 126,
  bars: 32,
  usedBy: 'unassigned -- bright plains theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x5a4f1d),
      chords: PROGRESSION,
      pad: { program: 48, volume: 44, velocity: 34 },
      texture: { program: 45, volume: 78, velocity: 50, restChance: 0.22 },
      lead: { program: 73, volume: 86, notes: MELODY },
      drum: {
        volume: 62,
        startBar: 4,
        pattern: [
          { beat: 0, pitch: 36, velocity: 58 },
          { beat: 1, pitch: 42, velocity: 30 },
          { beat: 2, pitch: 38, velocity: 50 },
          { beat: 3, pitch: 42, velocity: 32 },
        ],
      },
    });
  },
};
