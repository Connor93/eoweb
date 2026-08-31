import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Snow. C ionian, but voiced so it never sounds cheerful: a glockenspiel
 * dropping single notes into a lot of space, over a pad and almost nothing
 * else. Major mode plus extreme sparseness reads as cold rather than happy.
 */

const { i, iv, v, vi } = TRIAD;

const PROGRESSION = [i, i, v, v, vi, vi, iv, iv, i, i, iv, iv, v, v, i, i];

const MELODY = [
  [16, 4, 2, 64],
  [19, 2, 2, 60],
  [24, 0, 3, 62],
  [40, 4, 2, 66],
  [43, 6, 2, 62],
  [48, 4, 3, 64],
  [52, 0, 4, 60],
];

export default {
  id: 18,
  slug: 'whiteout',
  title: 'Whiteout',
  tonic: 60,
  mode: MODES.ionian,
  bpm: 64,
  bars: 16,
  // Trim toward the target mix level; measured, not guessed.
  // See lib/render.mjs for the curve and how to re-measure.
  gain: 1.102,
  usedBy: 'unassigned -- mapgen snow theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x3411e0),
      chords: PROGRESSION,
      pad: { program: 48, volume: 48, velocity: 36, reverb: 104 },
      texture: {
        program: 9,
        volume: 58,
        velocity: 40,
        noteBeats: 1,
        restChance: 0.7,
        octaves: [1, 2],
      },
      lead: { program: 75, volume: 76, notes: MELODY, reverb: 96 },
    });
  },
};
