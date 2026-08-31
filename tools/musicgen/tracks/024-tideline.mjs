import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Coast alternative in six, with a pan flute instead of a concert flute. The
 * compound metre gives it a swell the 4/4 original does not have.
 */

const { i, iv, vii } = TRIAD;

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
  iv,
  iv,
  vii,
  vii,
  i,
  i,
];

const MELODY = [
  [18, 4, 2, 70],
  [20, 6, 1, 66],
  [21, 7, 3, 74],
  [24, 5, 2, 68],
  [26, 4, 2, 70],
  [28, 2, 4, 72],
  [60, 7, 2, 74],
  [62, 6, 1, 68],
  [63, 4, 3, 70],
  [66, 2, 2, 66],
  [68, 0, 4, 68],
];

export default {
  id: 24,
  slug: 'tideline',
  title: 'Tideline',
  tonic: 62,
  mode: MODES.mixolydian,
  bpm: 72,
  bars: 16,
  beatsPerBar: 6,
  usedBy: 'unassigned -- alternative coast theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x71de11),
      chords: PROGRESSION,
      pad: { program: 48, volume: 46, velocity: 36, gapBeats: 0.5 },
      texture: {
        program: 46,
        volume: 74,
        velocity: 46,
        restChance: 0.4,
        octaves: [0, 1, 1],
      },
      lead: { program: 75, volume: 80, notes: MELODY },
    });
  },
};
