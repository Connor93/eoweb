import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * A temple or shrine. C ionian taken slowly enough that the major mode reads
 * as reverent rather than cheerful, with the choir carrying long tones over a
 * harp that never hurries.
 */

const { i, iv, v, vi } = TRIAD;

const PROGRESSION = [i, i, iv, iv, v, v, i, i, vi, vi, iv, iv, v, i];

const MELODY = [
  [16, 4, 4, 60],
  [21, 2, 3, 56],
  [32, 0, 4, 58],
  [37, 4, 3, 60],
  [44, 2, 4, 56],
];

export default {
  id: 26,
  slug: 'sanctum',
  title: 'Sanctum',
  tonic: 60,
  mode: MODES.ionian,
  bpm: 54,
  bars: 14,
  // Trim toward the target mix level; measured, not guessed.
  // See lib/render.mjs for the curve and how to re-measure.
  gain: 1.036,
  usedBy: 'unassigned -- temple / shrine theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x5a4c70),
      chords: PROGRESSION,
      pad: { program: 48, volume: 48, velocity: 36, reverb: 108 },
      texture: {
        program: 46,
        volume: 66,
        velocity: 40,
        noteBeats: 1,
        restChance: 0.5,
        octaves: [0, 1],
      },
      lead: { program: 52, volume: 78, notes: MELODY, reverb: 104 },
    });
  },
};
