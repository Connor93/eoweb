import { arpeggio, drone } from '../lib/figures.mjs';
import { createRng, MODES } from '../lib/music.mjs';

/**
 * Forest -- Ashford Forest I and II. G dorian.
 *
 * No percussion: a forest should sound like it has nobody in it keeping time.
 * Nylon guitar instead of harp, which reads woodier through this soundfont,
 * and the recorder only enters twice.
 */

const CHORD_I = [-7, -5, -3];
const CHORD_VII = [-8, -6, -4];
const CHORD_IV = [-4, -2, 0];

const PROGRESSION = [
  CHORD_I,
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
  CHORD_VII,
  CHORD_IV,
  CHORD_IV,
  CHORD_I,
  CHORD_I,
  CHORD_VII,
  CHORD_I,
];

const MELODY = [
  [20, 4, 1.5, 68],
  [21.5, 3, 0.5, 62],
  [22, 2, 2, 70],
  [25, 0, 1, 64],
  [26, 2, 2, 66],
  [52, 7, 1.5, 74],
  [53.5, 6, 0.5, 66],
  [54, 5, 2, 72],
  [57, 4, 1, 66],
  [58, 2, 2, 68],
];

export default {
  id: 3,
  slug: 'forest',
  title: 'Forest',
  tonic: 55,
  mode: MODES.dorian,
  bpm: 76,
  bars: 18,
  usedBy: 'Ashford Forest I, Ashford Forest II',

  compose(score) {
    const rng = createRng(0xf02e);

    const strings = score.part({
      name: 'Strings',
      channel: 0,
      program: 48,
      volume: 48,
      reverb: 92,
    });
    const guitar = score.part({
      name: 'Guitar',
      channel: 1,
      program: 24,
      volume: 80,
      reverb: 74,
    });
    const recorder = score.part({
      name: 'Recorder',
      channel: 2,
      program: 74,
      volume: 82,
      reverb: 72,
    });

    PROGRESSION.forEach((chord, bar) => {
      drone(strings, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord,
        velocity: 38,
        gapBeats: 0.5,
      });
      arpeggio(guitar, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord.map((degree) => degree + 7),
        noteBeats: 0.5,
        velocity: 50,
        velocityJitter: 7,
        restChance: 0.34,
        octaves: [0, 1],
        rng,
      });
    });

    for (const [beat, degree, duration, velocity] of MELODY) {
      recorder.note(beat, degree, duration, velocity);
    }
  },
};
