import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Crypt. Choir under tubular bells, with the pizzicato restating phrygian's
 * flat second -- the same half-step mfx006 uses, but answered by a bell.
 */

const { i, ii, iv } = TRIAD;

const PROGRESSION = [i, i, ii, ii, i, i, iv, iv, ii, i, iv, i];

const MELODY = [
  [8, 0, 1, 50],
  [10, 1, 1, 46],
  [12, 0, 2, 44],
  [32, 0, 1, 52],
  [34, 1, 1, 48],
  [36, 3, 2, 46],
];

export default {
  id: 20,
  slug: 'ossuary',
  title: 'Ossuary',
  tonic: 60,
  mode: MODES.phrygian,
  bpm: 50,
  bars: 12,
  // Trim toward the target mix level; measured, not guessed.
  // See lib/render.mjs for the curve and how to re-measure.
  gain: 1.153,
  usedBy: 'unassigned -- mapgen crypt theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x0554a2),
      chords: PROGRESSION,
      pad: { program: 52, volume: 52, velocity: 40, reverb: 108 },
      texture: {
        program: 14,
        volume: 54,
        velocity: 34,
        noteBeats: 2,
        restChance: 0.66,
        octaves: [1],
        reverb: 110,
      },
      lead: { program: 45, volume: 74, notes: MELODY, reverb: 90 },
    });
  },
};
