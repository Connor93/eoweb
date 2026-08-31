import { arpeggio, drone } from '../lib/figures.mjs';
import { createRng, MODES } from '../lib/music.mjs';

/**
 * The Spinner's Den. C phrygian.
 *
 * Phrygian's flat second is the whole idea: the half-step between C and Db is
 * the interval every horror score in existence leans on, and here it is the
 * only melodic move the pizzicato ever makes. Long stretches have no melody at
 * all, which is deliberate -- this plays while players are being ambushed and
 * it should leave room for the fight.
 */

const CHORD_I = [-7, -5, -3];
const CHORD_bII = [-6, -4, -2];
const CHORD_IV = [-4, -2, 0];

const PROGRESSION = [
  CHORD_I,
  CHORD_I,
  CHORD_I,
  CHORD_I,
  CHORD_bII,
  CHORD_bII,
  CHORD_I,
  CHORD_I,
  CHORD_IV,
  CHORD_IV,
  CHORD_bII,
  CHORD_I,
];

/** C -> Db -> C, stated twice in the whole loop. */
const PIZZICATO = [
  [8, 0, 1, 50],
  [10, 1, 1, 46],
  [12, 0, 2, 44],
  [32, 0, 1, 52],
  [34, 1, 1, 48],
  [36, 3, 2, 46],
];

export default {
  id: 6,
  slug: 'dungeon',
  title: 'The Deep',
  tonic: 60,
  mode: MODES.phrygian,
  bpm: 54,
  bars: 12,
  // Trim: this track is sparse enough to render well below the rest of
  // the soundtrack at the shared master gain. See lib/render.mjs.
  gain: 1.19,
  usedBy: "The Spinner's Den F1, The Spinner's Den F2",

  compose(score) {
    const rng = createRng(0xde49);

    const strings = score.part({
      name: 'Strings',
      channel: 0,
      program: 48,
      volume: 46,
      reverb: 104,
    });
    const pizzicato = score.part({
      name: 'Pizzicato',
      channel: 1,
      program: 45,
      volume: 74,
      reverb: 84,
    });
    const glints = score.part({
      name: 'Glints',
      channel: 2,
      program: 46,
      volume: 46,
      reverb: 108,
    });

    PROGRESSION.forEach((chord, bar) => {
      drone(strings, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord,
        velocity: 40,
        gapBeats: 0.25,
      });

      arpeggio(glints, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord.map((degree) => degree + 14),
        noteBeats: 1,
        velocity: 30,
        velocityJitter: 4,
        restChance: 0.82,
        rng,
      });
    });

    for (const [beat, degree, duration, velocity] of PIZZICATO) {
      pizzicato.note(beat, degree, duration, velocity);
    }
  },
};
