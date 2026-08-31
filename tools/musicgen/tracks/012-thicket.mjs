import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Forest alternative in six. G dorian with an oboe lead, which reads reedier
 * and older than mfx003's recorder.
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
  vii,
  iv,
  i,
  i,
  i,
  vii,
  vii,
  iv,
  i,
];

const MELODY = [
  [24, 4, 2, 70],
  [26, 3, 1, 64],
  [27, 2, 3, 72],
  [30, 0, 2, 66],
  [32, 2, 2, 68],
  [34, 4, 4, 72],
  [72, 7, 2, 76],
  [74, 6, 1, 68],
  [75, 5, 3, 74],
  [78, 4, 2, 68],
  [80, 2, 2, 70],
  [82, 0, 4, 68],
];

export default {
  id: 12,
  slug: 'thicket',
  title: 'Thicket',
  tonic: 55,
  mode: MODES.dorian,
  bpm: 84,
  bars: 18,
  beatsPerBar: 6,
  usedBy: 'unassigned -- alternative forest theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x7419c7),
      chords: PROGRESSION,
      pad: { program: 48, volume: 48, velocity: 38, gapBeats: 0.5 },
      texture: { program: 24, volume: 78, velocity: 48, restChance: 0.36 },
      lead: { program: 68, volume: 80, notes: MELODY },
    });
  },
};
