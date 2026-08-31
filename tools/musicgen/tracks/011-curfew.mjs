import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * The same towns after dark. D aeolian, no percussion, and a clarinet stating
 * five long tones where the daytime theme has a tune.
 */

const { i, iv, vi, vii } = TRIAD;

const PROGRESSION = [i, i, vi, vi, vii, vii, i, i, iv, iv, vii, vii, i, i];

const MELODY = [
  [16, 0, 3, 58],
  [20, 2, 2, 54],
  [23, 1, 3, 52],
  [40, 4, 3, 60],
  [44, 2, 2, 56],
  [47, 0, 4, 54],
];

export default {
  id: 11,
  slug: 'curfew',
  title: 'Curfew',
  tonic: 62,
  mode: MODES.aeolian,
  bpm: 58,
  bars: 14,
  gain: 1.06,
  usedBy: 'unassigned -- night-time town theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0xc0f2e7),
      chords: PROGRESSION,
      pad: { program: 48, volume: 54, velocity: 42, reverb: 100 },
      texture: {
        program: 46,
        volume: 56,
        velocity: 34,
        noteBeats: 1,
        restChance: 0.72,
        octaves: [1],
        reverb: 96,
      },
      lead: { program: 71, volume: 74, notes: MELODY, reverb: 88 },
    });
  },
};
