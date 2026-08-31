import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Boss theme for the Den. Slower than the combat track and heavier -- a
 * trombone on the phrygian half-step over a deliberate, stamping drum.
 */

const { i, ii, iv } = TRIAD;

const PROGRESSION = [
  i,
  i,
  ii,
  ii,
  i,
  i,
  ii,
  ii,
  iv,
  iv,
  ii,
  ii,
  i,
  i,
  i,
  i,
  ii,
  ii,
  iv,
  iv,
  ii,
  i,
  ii,
  i,
];

const MELODY = [
  [32, 0, 2, 78],
  [34, 1, 1, 72],
  [35, 0, 1, 70],
  [36, 3, 2, 80],
  [38, 1, 2, 74],
  [64, 0, 1, 80],
  [65, 1, 1, 76],
  [66, 3, 2, 82],
  [68, 4, 2, 78],
  [70, 3, 1, 74],
  [71, 1, 3, 76],
];

export default {
  id: 23,
  slug: 'spinner',
  title: 'The Spinner',
  tonic: 60,
  mode: MODES.phrygian,
  bpm: 92,
  bars: 24,
  usedBy: 'unassigned -- boss theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x5910e2),
      chords: PROGRESSION,
      pad: { program: 48, volume: 52, velocity: 42, reverb: 96 },
      texture: {
        program: 45,
        volume: 74,
        velocity: 48,
        noteBeats: 0.5,
        restChance: 0.2,
      },
      lead: { program: 57, volume: 84, notes: MELODY },
      drum: {
        volume: 70,
        startBar: 4,
        pattern: [
          { beat: 0, pitch: 36, velocity: 78 },
          { beat: 1.5, pitch: 41, velocity: 50 },
          { beat: 2, pitch: 38, velocity: 70 },
          { beat: 3, pitch: 45, velocity: 54 },
        ],
      },
    });
  },
};
