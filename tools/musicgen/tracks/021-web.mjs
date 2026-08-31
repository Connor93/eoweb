import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Dungeon alternative, agitated rather than empty. Same phrygian as mfx006 but
 * half again as fast, with a pizzicato ostinato that barely rests and a low
 * tom pulse underneath.
 */

const { i, ii, iv } = TRIAD;

const PROGRESSION = [
  i,
  i,
  i,
  i,
  ii,
  ii,
  i,
  i,
  iv,
  iv,
  ii,
  ii,
  i,
  i,
  ii,
  ii,
  iv,
  ii,
  i,
  i,
];

const MELODY = [
  [16, 0, 1, 58],
  [17, 1, 1, 54],
  [18, 0, 2, 52],
  [48, 0, 1, 60],
  [49, 1, 1, 56],
  [50, 3, 2, 54],
  [52, 1, 1, 52],
  [53, 0, 3, 56],
];

export default {
  id: 21,
  slug: 'web',
  title: 'Web',
  tonic: 60,
  mode: MODES.phrygian,
  bpm: 76,
  bars: 20,
  usedBy: 'unassigned -- tense dungeon theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x3eb001),
      chords: PROGRESSION,
      pad: { program: 48, volume: 46, velocity: 36, reverb: 100 },
      texture: {
        program: 45,
        volume: 72,
        velocity: 44,
        noteBeats: 0.5,
        restChance: 0.16,
      },
      lead: { program: 42, volume: 76, notes: MELODY, reverb: 88 },
      drum: {
        volume: 58,
        startBar: 8,
        pattern: [
          { beat: 0, pitch: 41, velocity: 44 },
          { beat: 2.5, pitch: 41, velocity: 32 },
        ],
      },
    });
  },
};
