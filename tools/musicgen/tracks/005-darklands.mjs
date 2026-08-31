import { arpeggio, drone } from '../lib/figures.mjs';
import { createRng, MODES } from '../lib/music.mjs';

/**
 * The Darklands. A aeolian.
 *
 * No percussion and no tune -- a cello states four or five long tones in the
 * whole loop and otherwise the track is just harmony moving underneath. The
 * slowest tempo in the set outside the dungeon.
 */

const CHORD_I = [-7, -5, -3];
const CHORD_VI = [-9, -7, -5];
const CHORD_VII = [-8, -6, -4];
const CHORD_IV = [-4, -2, 0];

const PROGRESSION = [
  CHORD_I,
  CHORD_I,
  CHORD_I,
  CHORD_VI,
  CHORD_VI,
  CHORD_VII,
  CHORD_VII,
  CHORD_I,
  CHORD_I,
  CHORD_IV,
  CHORD_IV,
  CHORD_VII,
  CHORD_VII,
  CHORD_I,
];

/** Long, widely spaced tones -- statements, not a melody. */
const CELLO = [
  [16, 0, 3, 54],
  [20, 2, 2, 50],
  [23, 1, 3, 48],
  [40, 4, 3, 56],
  [44, 2, 2, 52],
  [47, 0, 4, 50],
];

export default {
  id: 5,
  slug: 'darklands',
  title: 'Darklands',
  tonic: 57,
  mode: MODES.aeolian,
  bpm: 62,
  bars: 14,
  // Trim: this track is sparse enough to render well below the rest of
  // the soundtrack at the shared master gain. See lib/render.mjs.
  gain: 1.08,
  usedBy: 'Darklands I, Darklands II, Darklands Witch',

  compose(score) {
    const rng = createRng(0xda12);

    const strings = score.part({
      name: 'Strings',
      channel: 0,
      program: 48,
      volume: 54,
      reverb: 100,
    });
    const cello = score.part({
      name: 'Cello',
      channel: 1,
      program: 42,
      volume: 72,
      reverb: 88,
    });
    const harp = score.part({
      name: 'Harp',
      channel: 2,
      program: 46,
      volume: 58,
      reverb: 96,
    });

    PROGRESSION.forEach((chord, bar) => {
      drone(strings, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord,
        velocity: 42,
        gapBeats: 0.25,
      });

      // Mostly rests: the harp is an occasional glint off something wet, not
      // an accompaniment.
      arpeggio(harp, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord.map((degree) => degree + 14),
        noteBeats: 1,
        velocity: 34,
        velocityJitter: 5,
        restChance: 0.76,
        rng,
      });
    });

    for (const [beat, degree, duration, velocity] of CELLO) {
      cello.note(beat, degree, duration, velocity);
    }
  },
};
