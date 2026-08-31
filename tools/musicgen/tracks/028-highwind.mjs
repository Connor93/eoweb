import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * High open ground. A mixolydian with a pan flute sitting above a thin harp --
 * the airiest of the open-country options, for the hills rather than the road.
 */

const { i, iv, v, vii } = TRIAD;

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
  i,
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
  id: 28,
  slug: 'highwind',
  title: 'High Wind',
  tonic: 57,
  mode: MODES.mixolydian,
  bpm: 78,
  bars: 18,
  usedBy: 'unassigned -- airy highlands theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x819111),
      chords: PROGRESSION,
      pad: { program: 48, volume: 46, velocity: 36, gapBeats: 0.5 },
      texture: {
        program: 46,
        volume: 72,
        velocity: 44,
        restChance: 0.46,
        octaves: [0, 1, 1],
      },
      lead: { program: 75, volume: 80, notes: MELODY },
    });
  },
};
