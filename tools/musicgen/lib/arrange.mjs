/**
 * The arrangement every world track shares.
 *
 * Most tracks are the same four voices over a per-bar chord plan: a sustained
 * pad, an arpeggiated texture, a melodic lead and optional percussion. Putting
 * that here lets a track file be almost entirely musical decisions -- which
 * mode, which chords, which notes -- instead of twenty lines of part wiring
 * repeated verbatim.
 *
 * Channels are assigned here rather than per track, because the one thing a
 * track must never do is put two voices on one channel: a lead colliding with
 * its own accompaniment on a pitch leaves a note ringing until the sequencer
 * resets.
 */

import { arpeggio, drone, pulse } from './figures.mjs';

const CHANNEL_PAD = 0;
const CHANNEL_TEXTURE = 1;
const CHANNEL_LEAD = 2;
const CHANNEL_COUNTER = 3;
const CHANNEL_DRUM = 9;

export function arrange(score, spec) {
  const { chords, rng, pad, texture, lead, counter, drum } = spec;
  const beatsPerBar = score.beatsPerBar;

  if (!Array.isArray(chords) || chords.length !== score.bars) {
    throw new Error(
      `chords must cover every bar: got ${chords?.length} for ${score.bars} bars`,
    );
  }

  if (pad) {
    const part = score.part({
      name: 'Pad',
      channel: CHANNEL_PAD,
      program: pad.program,
      volume: pad.volume ?? 50,
      reverb: pad.reverb ?? 92,
    });
    chords.forEach((chord, bar) => {
      drone(part, {
        startBar: bar,
        bars: 1,
        beatsPerBar,
        degrees: chord.map((degree) => degree + (pad.transpose ?? 0)),
        velocity: pad.velocity ?? 40,
        gapBeats: pad.gapBeats ?? 0.25,
      });
    });
  }

  if (texture) {
    const part = score.part({
      name: 'Texture',
      channel: CHANNEL_TEXTURE,
      program: texture.program,
      volume: texture.volume ?? 78,
      reverb: texture.reverb ?? 74,
    });
    chords.forEach((chord, bar) => {
      arpeggio(part, {
        startBar: bar,
        bars: 1,
        beatsPerBar,
        degrees: chord.map((degree) => degree + (texture.transpose ?? 7)),
        noteBeats: texture.noteBeats ?? 0.5,
        velocity: texture.velocity ?? 50,
        velocityJitter: texture.jitter ?? 6,
        restChance: texture.restChance ?? 0.3,
        octaves: texture.octaves ?? [0, 1],
        rng,
      });
    });
  }

  for (const [voice, channel, name] of [
    [lead, CHANNEL_LEAD, 'Lead'],
    [counter, CHANNEL_COUNTER, 'Counter'],
  ]) {
    if (!voice) {
      continue;
    }
    const part = score.part({
      name,
      channel,
      program: voice.program,
      volume: voice.volume ?? 84,
      reverb: voice.reverb ?? 70,
    });
    for (const [beat, degree, duration, velocity] of voice.notes) {
      part.note(beat, degree, duration, velocity);
    }
  }

  if (drum) {
    const part = score.part({
      name: 'Drum',
      channel: CHANNEL_DRUM,
      volume: drum.volume ?? 68,
    });
    const startBar = drum.startBar ?? 0;
    pulse(part, {
      startBar,
      bars: drum.bars ?? score.bars - startBar,
      beatsPerBar,
      pattern: drum.pattern,
    });
  }
}
