import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * The witch's wood. E phrygian with a sitar carrying the figuration, which is
 * the one genuinely foreign colour in the set -- it should sound like it does
 * not belong to the same country as the town themes.
 */

const { i, ii, iv } = TRIAD;

const PROGRESSION = [i, i, ii, ii, i, i, iv, iv, ii, ii, i, i, iv, ii, i, i];

const MELODY = [
  [16, 0, 2, 62],
  [19, 1, 2, 58],
  [24, 3, 3, 64],
  [32, 4, 2, 66],
  [35, 3, 2, 60],
  [40, 1, 2, 58],
  [43, 0, 4, 60],
];

export default {
  id: 27,
  slug: 'hexwood',
  title: 'Hexwood',
  tonic: 64,
  mode: MODES.phrygian,
  bpm: 66,
  bars: 16,
  usedBy: 'unassigned -- witch / mystic theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x4e8000),
      chords: PROGRESSION,
      pad: { program: 48, volume: 48, velocity: 38, reverb: 100 },
      texture: {
        program: 104,
        volume: 70,
        velocity: 44,
        noteBeats: 0.5,
        restChance: 0.42,
      },
      lead: { program: 68, volume: 78, notes: MELODY, reverb: 88 },
    });
  },
};
