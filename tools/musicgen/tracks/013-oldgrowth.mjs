import { arrange } from '../lib/arrange.mjs';
import { createRng, MODES, TRIAD } from '../lib/music.mjs';

/**
 * Deep forest. At 48bpm this is the slowest track in the set bar the ice cave
 * -- a koto figure over strings, with an english horn stating five tones and
 * nothing else happening at all.
 */

const { i, iv, vii } = TRIAD;

const PROGRESSION = [i, i, i, vii, vii, iv, iv, i, i, vii, iv, i];

const MELODY = [
  [12, 0, 4, 56],
  [17, 2, 3, 52],
  [24, 4, 4, 58],
  [29, 2, 3, 54],
  [36, 0, 4, 52],
];

export default {
  id: 13,
  slug: 'oldgrowth',
  title: 'Old Growth',
  tonic: 57,
  mode: MODES.dorian,
  bpm: 48,
  bars: 12,
  gain: 1.08,
  usedBy: 'unassigned -- deep forest theme',

  compose(score) {
    arrange(score, {
      rng: createRng(0x01d92a),
      chords: PROGRESSION,
      pad: { program: 48, volume: 50, velocity: 38, reverb: 104 },
      texture: {
        program: 107,
        volume: 66,
        velocity: 40,
        noteBeats: 1,
        restChance: 0.6,
        octaves: [0, 1],
      },
      lead: { program: 69, volume: 76, notes: MELODY, reverb: 92 },
    });
  },
};
