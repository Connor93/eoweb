import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Swamp -- one of the four mapgen themes with no track of its own until now.
 * 46bpm, a bassoon in its low register over pizzicato, nothing sustaining.
 */

const { i, iv, vi, vii } = TRIAD;

const PROGRESSION = [i, i, vi, vi, vii, vii, i, i, iv, vii, i];

const MELODY = [
  [12, 0, 3, 54],
  [16, 2, 2, 50],
  [19, 1, 3, 48],
  [32, 3, 3, 56],
  [36, 1, 2, 52],
  [39, 0, 4, 50],
];

export default {
  id: 17,
  slug: 'mire',
  title: 'Mire',
  tonic: 62,
  mode: MODES.aeolian,
  bpm: 46,
  bars: 11,
  // Trim toward the target mix level; measured, not guessed.
  // See lib/render.mjs for the curve and how to re-measure.
  gain: 1.113,
  usedBy: 'unassigned -- mapgen swamp theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x312e00),
      chords: PROGRESSION,
      pad: { program: 48, volume: 50, velocity: 38, reverb: 100 },
      texture: {
        program: 45,
        volume: 62,
        velocity: 38,
        noteBeats: 1,
        restChance: 0.68,
      },
      lead: { program: 70, volume: 78, notes: MELODY, reverb: 86 },
    });
  },
};
