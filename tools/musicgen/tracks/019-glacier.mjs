import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Ice cave. The quietest, emptiest thing here: a glockenspiel two octaves up
 * dropping a note every few bars, and a vibraphone stating three tones in the
 * entire loop. Deliberately close to silence without being silent.
 */

const { i, iv, vi, vii } = TRIAD;

const PROGRESSION = [i, i, i, vi, vi, vii, vii, i, iv, vii, i];

const MELODY = [
  [12, 0, 4, 50],
  [20, 2, 3, 48],
  [32, 4, 4, 52],
];

export default {
  id: 19,
  slug: 'glacier',
  title: 'Glacier',
  tonic: 60,
  mode: MODES.aeolian,
  bpm: 46,
  bars: 11,
  // Trim toward the target mix level; measured, not guessed.
  // See lib/render.mjs for the curve and how to re-measure.
  gain: 1.177,
  usedBy: 'unassigned -- mapgen ice cave theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x91ac1e),
      chords: PROGRESSION,
      pad: { program: 48, volume: 48, velocity: 36, reverb: 112 },
      texture: {
        program: 9,
        volume: 52,
        velocity: 34,
        noteBeats: 1,
        restChance: 0.84,
        octaves: [1, 2],
        reverb: 112,
      },
      lead: { program: 11, volume: 66, notes: MELODY, reverb: 108 },
    });
  },
};
