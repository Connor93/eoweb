import { arpeggio, drone, pulse } from '../lib/figures.mjs';
import { createRng, MODES } from '../lib/music.mjs';

/**
 * Open country -- the wildlands, hills, highlands and the passes between them.
 * A mixolydian.
 *
 * The only major-ish track in the set. Mixolydian's flat seventh keeps it from
 * turning into a fanfare, and the walking drum gives the long crossings
 * between towns some forward motion.
 */

const CHORD_I = [-7, -5, -3];
const CHORD_V = [-3, -1, 1];
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
  CHORD_I,
  CHORD_V,
  CHORD_V,
  CHORD_VII,
  CHORD_VII,
  CHORD_I,
  CHORD_I,
  CHORD_IV,
  CHORD_IV,
  CHORD_I,
  CHORD_I,
];

const MELODY = [
  [20, 4, 1.5, 72],
  [21.5, 5, 0.5, 66],
  [22, 6, 2, 74],
  [25, 4, 1, 68],
  [26, 3, 2, 70],
  [52, 7, 1.5, 78],
  [53.5, 6, 0.5, 70],
  [54, 4, 2, 74],
  [57, 3, 1, 68],
  [58, 0, 2, 70],
];

const DRUM_PATTERN = [
  { beat: 0, pitch: 41, velocity: 58 },
  { beat: 1, pitch: 69, velocity: 30 },
  { beat: 2, pitch: 45, velocity: 48 },
  { beat: 3, pitch: 69, velocity: 32 },
];

export default {
  id: 4,
  slug: 'wildlands',
  title: 'Open Country',
  tonic: 57,
  mode: MODES.mixolydian,
  bpm: 88,
  bars: 20,
  usedBy:
    'Western Wildlands I/II, Western Hills, Highlands, Hills II, Withered Pass, Landing Zone',

  compose(score) {
    const rng = createRng(0x21d1);

    const strings = score.part({
      name: 'Strings',
      channel: 0,
      program: 48,
      volume: 50,
      reverb: 90,
    });
    const harp = score.part({
      name: 'Harp',
      channel: 1,
      program: 46,
      volume: 78,
      reverb: 72,
    });
    const flute = score.part({
      name: 'Flute',
      channel: 2,
      program: 73,
      volume: 84,
      reverb: 66,
    });
    const drum = score.part({ name: 'Drum', channel: 9, volume: 64 });

    PROGRESSION.forEach((chord, bar) => {
      drone(strings, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord,
        velocity: 38,
        gapBeats: 0.25,
      });
      arpeggio(harp, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord.map((degree) => degree + 7),
        noteBeats: 0.5,
        velocity: 48,
        velocityJitter: 7,
        restChance: 0.3,
        octaves: [0, 1],
        rng,
      });
    });

    pulse(drum, {
      startBar: 4,
      bars: 16,
      beatsPerBar: 4,
      pattern: DRUM_PATTERN,
    });

    for (const [beat, degree, duration, velocity] of MELODY) {
      flute.note(beat, degree, duration, velocity);
    }
  },
};
