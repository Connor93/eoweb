/** Turn a track descriptor into a rendered score. */

import { createScore } from './score.mjs';

/**
 * One calibration knob for the whole soundtrack.
 *
 * The tracks are written with musical dynamics in mind (a drone at 40, a lead
 * at 80) and those relative values are what matter; this scales all of them
 * together so the finished mix sits a sensible distance below the game's sound
 * effects, which peak around 0.4-0.8. Background music wants to land near 0.25
 * -- present, but never competing with a sword swing.
 *
 * 1.25 was measured, not guessed: it puts the title theme's peak at 0.243
 * against sfx001/sfx043 at 0.54/0.82. The curve is steep (gain 1.0 renders at
 * 0.099, gain 1.4 at 0.377) because SF2 velocity maps to attenuation
 * exponentially, so re-measure rather than extrapolate if you change it.
 */
export const MASTER_GAIN = Number(process.env.MUSICGEN_GAIN ?? 1.25);

export function renderTrack(track, gain = MASTER_GAIN) {
  // A sparse track (one cello, mostly rests) renders far quieter than a busy
  // one at the same master gain, so a descriptor may trim itself toward the
  // target level without disturbing the rest of the soundtrack.
  const trimmed = gain * (track.gain ?? 1);

  const score = createScore({
    name: track.title,
    tonic: track.tonic,
    mode: track.mode,
    bpm: track.bpm,
    bars: track.bars,
    beatsPerBar: track.beatsPerBar ?? 4,
    gain: trimmed,
  });

  track.compose(score);

  return score;
}
