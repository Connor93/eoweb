import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Darklands alternative. E phrygian with a choir pad instead of strings, which
 * is the one place in the set where a voice patch earns its keep.
 */

const { i, ii, iv } = TRIAD;

const PROGRESSION = [i, i, ii, ii, i, i, iv, iv, ii, ii, i, i, iv, i];

const MELODY = [
  [16, 0, 3, 56],
  [20, 1, 2, 52],
  [23, 0, 3, 50],
  [40, 3, 3, 58],
  [44, 1, 2, 54],
  [47, 0, 4, 52],
];

export default {
  id: 16,
  slug: 'gloaming',
  title: 'Gloaming',
  tonic: 64,
  mode: MODES.phrygian,
  bpm: 56,
  bars: 14,
  // Trim toward the target mix level; measured, not guessed.
  // See lib/render.mjs for the curve and how to re-measure.
  gain: 1.04,
  usedBy: 'unassigned -- alternative darklands theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x6106a3),
      chords: PROGRESSION,
      pad: { program: 52, volume: 56, velocity: 42, reverb: 104 },
      texture: {
        program: 46,
        volume: 52,
        velocity: 32,
        noteBeats: 1,
        restChance: 0.78,
        octaves: [1],
      },
      lead: { program: 42, volume: 74, notes: MELODY, reverb: 92 },
    });
  },
};
