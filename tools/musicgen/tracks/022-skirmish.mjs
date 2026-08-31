import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Combat. Nothing triggers this today -- the protocol has no per-fight music
 * hook, only per-map plus the jukebox/server-effect path -- so it exists to be
 * auditioned and to be ready if a fight track ever gets a trigger.
 */

const { i, iv, vi, vii } = TRIAD;

const PROGRESSION = [
  i,
  i,
  vii,
  vii,
  vi,
  vi,
  vii,
  vii,
  i,
  i,
  iv,
  iv,
  vii,
  vii,
  i,
  i,
  i,
  i,
  vi,
  vi,
  iv,
  iv,
  vii,
  vii,
  i,
  vii,
  vi,
  vii,
  i,
  i,
  i,
  i,
];

const MELODY = [
  [32, 0, 1, 76],
  [33, 2, 1, 74],
  [34, 4, 2, 80],
  [36, 3, 1, 74],
  [37, 2, 1, 72],
  [38, 0, 2, 76],
  [64, 4, 1, 80],
  [65, 6, 1, 78],
  [66, 7, 2, 84],
  [68, 6, 1, 78],
  [69, 4, 1, 76],
  [70, 2, 2, 78],
  [96, 0, 1, 78],
  [97, 4, 1, 80],
  [98, 3, 2, 76],
  [100, 2, 1, 72],
  [101, 0, 3, 78],
];

export default {
  id: 22,
  slug: 'skirmish',
  title: 'Skirmish',
  tonic: 57,
  mode: MODES.aeolian,
  bpm: 138,
  bars: 32,
  // Trim toward the target mix level; measured, not guessed.
  // See lib/render.mjs for the curve and how to re-measure.
  gain: 0.955,
  usedBy: 'unassigned -- combat theme (no trigger exists yet)',

  compose(score) {
    arrange(score, {
      rng: createRng(0x5219a1),
      chords: PROGRESSION,
      pad: { program: 48, volume: 50, velocity: 42 },
      texture: {
        program: 45,
        volume: 78,
        velocity: 54,
        noteBeats: 0.5,
        restChance: 0.12,
      },
      lead: { program: 60, volume: 86, notes: MELODY },
      drum: {
        volume: 72,
        startBar: 4,
        pattern: [
          { beat: 0, pitch: 36, velocity: 72 },
          { beat: 1, pitch: 42, velocity: 40 },
          { beat: 2, pitch: 38, velocity: 66 },
          { beat: 2.5, pitch: 36, velocity: 50 },
          { beat: 3, pitch: 42, velocity: 42 },
        ],
      },
    });
  },
};
