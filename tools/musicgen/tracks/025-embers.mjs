import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Interiors, in three. Quieter than mfx008 and slower -- a guitar turning over
 * a waltz figure with a pad barely present underneath.
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
  iv,
  i,
  i,
  i,
  vii,
  iv,
  i,
];

const MELODY = [
  [18, 4, 1, 54],
  [19, 3, 1, 50],
  [20, 2, 2, 56],
  [22, 0, 2, 52],
  [45, 2, 1, 54],
  [46, 4, 1, 56],
  [47, 3, 2, 52],
  [49, 0, 2, 54],
];

export default {
  id: 25,
  slug: 'embers',
  title: 'Embers',
  tonic: 55,
  mode: MODES.dorian,
  bpm: 64,
  bars: 24,
  // Trim toward the target mix level; measured, not guessed.
  // See lib/render.mjs for the curve and how to re-measure.
  gain: 1.099,
  beatsPerBar: 3,
  usedBy: 'unassigned -- alternative interior theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0xe3be25),
      chords: PROGRESSION,
      pad: { program: 48, volume: 34, velocity: 30, gapBeats: 0.5 },
      texture: { program: 24, volume: 72, velocity: 44, restChance: 0.44 },
      lead: { program: 24, volume: 78, notes: MELODY },
    });
  },
};
