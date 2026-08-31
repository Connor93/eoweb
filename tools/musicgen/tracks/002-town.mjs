import { arpeggio, drone, pulse } from '../lib/figures.mjs';
import { createRng, MODES } from '../lib/music.mjs';

/**
 * Towns -- Ashford, Ashford Town, Aeven. D dorian.
 *
 * Players park in towns for hours, so the tune is rationed: two short phrases
 * in twenty bars, with the harp and a light frame drum carrying everything
 * between them. The drum is the only thing separating this from the wilderness
 * tracks -- a settled, walked-on pulse.
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
  [16, 0, 1, 66],
  [17, 2, 1, 68],
  [18, 4, 2, 72],
  [21, 3, 1, 66],
  [22, 2, 2, 68],
  [48, 4, 1, 70],
  [49, 6, 1, 72],
  [50, 7, 2, 76],
  [53, 5, 1, 68],
  [54, 4, 2, 70],
  [72, 2, 1.5, 66],
  [73.5, 0, 2, 64],
];

/** Low tom on the downbeat, shaker on the offbeats. */
const DRUM_PATTERN = [
  { beat: 0, pitch: 41, velocity: 62 },
  { beat: 1.5, pitch: 70, velocity: 34 },
  { beat: 2, pitch: 41, velocity: 44 },
  { beat: 2.5, pitch: 70, velocity: 30 },
  { beat: 3.5, pitch: 70, velocity: 36 },
];

export default {
  id: 2,
  slug: 'town',
  title: 'Town',
  tonic: 62,
  mode: MODES.dorian,
  bpm: 84,
  bars: 20,
  usedBy: 'Ashford, Ashford Town, Aeven',

  compose(score) {
    const rng = createRng(0x70b7);

    const strings = score.part({
      name: 'Strings',
      channel: 0,
      program: 48,
      volume: 52,
      reverb: 88,
    });
    const harp = score.part({
      name: 'Harp',
      channel: 1,
      program: 46,
      volume: 84,
      reverb: 70,
    });
    const recorder = score.part({
      name: 'Recorder',
      channel: 2,
      program: 74,
      volume: 86,
      reverb: 64,
    });
    const drum = score.part({ name: 'Drum', channel: 9, volume: 70 });

    PROGRESSION.forEach((chord, bar) => {
      drone(strings, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord,
        velocity: 40,
        gapBeats: 0.25,
      });
      arpeggio(harp, {
        startBar: bar,
        bars: 1,
        beatsPerBar: 4,
        degrees: chord.map((degree) => degree + 7),
        noteBeats: 0.5,
        velocity: 52,
        velocityJitter: 6,
        restChance: 0.28,
        octaves: [0, 1],
        rng,
      });
    });

    // The drum stays out of the first two bars so the loop turns over into a
    // bare harp rather than a downbeat.
    pulse(drum, {
      startBar: 2,
      bars: 18,
      beatsPerBar: 4,
      pattern: DRUM_PATTERN,
    });

    for (const [beat, degree, duration, velocity] of MELODY) {
      recorder.note(beat, degree, duration, velocity);
    }
  },
};
