import { arpeggio, drone } from '../lib/figures.mjs';
import { createRng, MODES } from '../lib/music.mjs';

/**
 * Interiors -- the fisherman's hut, the farmstead, the witch's room. G dorian.
 *
 * These maps are a dozen tiles across and a player is in them for thirty
 * seconds, so the track is almost nothing: one nylon guitar, a string pad
 * under it at half the volume of anywhere else, and no melody to speak of.
 */

const CHORD_I = [-7, -5, -3];
const CHORD_VII = [-8, -6, -4];
const CHORD_IV = [-4, -2, 0];

const PROGRESSION = [
  CHORD_I,
  CHORD_I,
  CHORD_VII,
  CHORD_VII,
  CHORD_IV,
  CHORD_IV,
  CHORD_I,
  CHORD_I,
  CHORD_I,
  CHORD_VII,
  CHORD_IV,
  CHORD_I,
  CHORD_I,
  CHORD_I,
];

const GUITAR_FIGURE = [
  [24, 4, 1.5, 56],
  [25.5, 3, 0.5, 50],
  [26, 2, 2, 54],
  [29, 0, 2, 52],
];

export default {
  id: 8,
  slug: 'hearth',
  title: 'Hearth',
  tonic: 55,
  mode: MODES.dorian,
  bpm: 70,
  bars: 14,
  // Trim: this track is sparse enough to render well below the rest of
  // the soundtrack at the shared master gain. See lib/render.mjs.
  gain: 1.1,
  usedBy: 'Fisherman Hut, Farmstead, Darklands Witch',

  compose(score) {
    const rng = createRng(0x4ea7);

    const strings = score.part({
      name: 'Strings',
      channel: 0,
      program: 48,
      volume: 34,
      reverb: 84,
    });
    const guitar = score.part({
      name: 'Guitar',
      channel: 1,
      program: 24,
      volume: 72,
      reverb: 70,
    });
    // The figure is a second voice of the same instrument on its own channel:
    // sharing the arpeggio's channel lets the two collide on a pitch, and the
    // release then pairs with the newer note while the older one hangs.
    const lead = score.part({
      name: 'Guitar Lead',
      channel: 2,
      program: 24,
      volume: 78,
      reverb: 70,
    });

    PROGRESSION.forEach((chord, bar) => {
      drone(strings, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord,
        velocity: 30,
        gapBeats: 0.5,
      });
      arpeggio(guitar, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord.map((degree) => degree + 7),
        noteBeats: 0.5,
        velocity: 44,
        velocityJitter: 6,
        restChance: 0.46,
        octaves: [0, 1],
        rng,
      });
    });

    for (const [beat, degree, duration, velocity] of GUITAR_FIGURE) {
      lead.note(beat, degree, duration, velocity);
    }
  },
};
