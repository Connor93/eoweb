/**
 * The surface a track file is written against.
 *
 * Time is expressed in beats (floats welcome), pitch in scale degrees, and the
 * score owns the loop length. Notes are refused if they would sustain past the
 * loop point: the sequencer restarts the file from tick 0 with loopCount set to
 * infinity, so anything still ringing at the end is chopped mid-decay on every
 * single repeat -- the most common way a looping game track sounds broken.
 */

import { pitchOf } from './music.mjs';
import { buildMidi, createTrack } from './smf.mjs';

export const TICKS_PER_BEAT = 96;

const CC_VOLUME = 7;
const CC_REVERB = 91;
const PERCUSSION_CHANNEL = 9;

/** Clamp to the 1..127 range every MIDI amplitude byte lives in. */
function clampLevel(value) {
  return Math.max(1, Math.min(127, Math.round(value)));
}

export function createScore({
  name,
  tonic,
  mode,
  bpm,
  bars,
  beatsPerBar = 4,
  gain = 1,
}) {
  const lengthTicks = bars * beatsPerBar * TICKS_PER_BEAT;
  const parts = [];

  const conductor = createTrack(0);
  conductor.name(name);
  conductor.tempo(0, bpm);
  conductor.timeSignature(0, beatsPerBar, 4);

  return {
    name,
    tonic,
    mode,
    bpm,
    bars,
    beatsPerBar,
    lengthTicks,
    lengthBeats: bars * beatsPerBar,

    part({ name: partName, channel, program, volume = 100, reverb }) {
      const track = createTrack(channel);
      track.name(partName);
      // Channel 10 (index 9) is percussion: its "program" is fixed by the GM
      // drum kit and a program change there just picks a different kit.
      if (program !== undefined && channel !== PERCUSSION_CHANNEL) {
        track.program(0, program);
      }
      track.controller(0, CC_VOLUME, clampLevel(volume * gain));
      if (reverb !== undefined) {
        track.controller(0, CC_REVERB, reverb);
      }
      parts.push(track);

      const place = (atBeats, pitch, durationBeats, velocity) => {
        const tick = Math.round(atBeats * TICKS_PER_BEAT);
        const duration = Math.round(durationBeats * TICKS_PER_BEAT);
        if (tick + duration > lengthTicks) {
          throw new RangeError(
            `${partName}: note at beat ${atBeats} runs ${durationBeats} beats and would sustain past the loop point (${lengthTicks} ticks)`,
          );
        }
        track.note(tick, pitch, duration, clampLevel(velocity * gain));
      };

      return {
        /** Place a note by scale degree in the score's mode. */
        note(atBeats, degree, durationBeats, velocity) {
          place(atBeats, pitchOf(tonic, mode, degree), durationBeats, velocity);
        },
        /** Place a note by absolute MIDI pitch (percussion, or a chromatic). */
        hit: place,
        /** Sound several degrees together. */
        chord(atBeats, degrees, durationBeats, velocity) {
          for (const degree of degrees) {
            place(
              atBeats,
              pitchOf(tonic, mode, degree),
              durationBeats,
              velocity,
            );
          }
        },
      };
    },

    toMidi() {
      return buildMidi({
        ticksPerBeat: TICKS_PER_BEAT,
        lengthTicks,
        tracks: [conductor, ...parts],
      });
    },
  };
}
