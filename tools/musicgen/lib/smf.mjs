/**
 * Minimal Standard MIDI File writer.
 *
 * Emits format-1 files without running status: every event carries its own
 * status byte. That is a few bytes more on the wire than a compacted encoder
 * would produce -- noise next to the 5.7MB soundfont -- and in exchange the
 * output can be diffed byte-for-byte against the spec by hand.
 */

const NOTE_OFF_VELOCITY = 64;

/**
 * Tie-break for events landing on the same tick. Setup (programs, controllers,
 * meta) must be in place before anything sounds, and a release must precede a
 * re-attack of the same pitch -- the other order silences the note that just
 * started.
 */
const RANK_SETUP = 0;
const RANK_NOTE_OFF = 1;
const RANK_NOTE_ON = 2;

/** SMF variable-length quantity: 7 bits per byte, high bit means "more follows". */
function varint(value) {
  const out = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return out;
}

function assertRange(label, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(
      `${label} must be an integer in ${min}..${max}, got ${value}`,
    );
  }
}

/** Text meta events are ASCII with a varint length. */
function metaText(type, text) {
  const encoded = Array.from(text, (character) => character.charCodeAt(0));
  return [0xff, type, ...varint(encoded.length), ...encoded];
}

export function createTrack(channel = 0) {
  assertRange('channel', channel, 0, 15);

  const events = [];
  const meta = (tick, bytes) => {
    events.push({ tick, rank: RANK_SETUP, bytes });
  };

  return {
    events,
    channel,
    name(text) {
      meta(0, metaText(0x03, text));
    },
    tempo(tick, bpm) {
      const usPerQuarter = Math.round(60000000 / bpm);
      meta(tick, [
        0xff,
        0x51,
        0x03,
        (usPerQuarter >>> 16) & 0xff,
        (usPerQuarter >>> 8) & 0xff,
        usPerQuarter & 0xff,
      ]);
    },
    timeSignature(tick, numerator, denominator) {
      meta(tick, [
        0xff,
        0x58,
        0x04,
        numerator,
        Math.log2(denominator),
        0x18,
        0x08,
      ]);
    },
    program(tick, patch) {
      assertRange('patch', patch, 0, 127);
      meta(tick, [0xc0 | channel, patch]);
    },
    controller(tick, cc, value) {
      assertRange('cc', cc, 0, 127);
      assertRange('value', value, 0, 127);
      meta(tick, [0xb0 | channel, cc, value]);
    },
    note(tick, pitch, duration, velocity) {
      assertRange('pitch', pitch, 0, 127);
      assertRange('velocity', velocity, 1, 127);
      if (!Number.isInteger(duration) || duration <= 0) {
        throw new RangeError(
          `duration must be a positive integer, got ${duration}`,
        );
      }
      events.push({
        tick,
        rank: RANK_NOTE_ON,
        bytes: [0x90 | channel, pitch, velocity],
      });
      events.push({
        tick: tick + duration,
        rank: RANK_NOTE_OFF,
        bytes: [0x80 | channel, pitch, NOTE_OFF_VELOCITY],
      });
    },
  };
}

function serializeTrack(track, lengthTicks) {
  const ordered = [...track.events].sort(
    (a, b) => a.tick - b.tick || a.rank - b.rank,
  );

  const body = [];
  let previousTick = 0;
  for (const event of ordered) {
    body.push(...varint(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }

  // The end-of-track meta IS the loop point, so a caller that declares a
  // length gets exactly that many ticks even when the last note stops early.
  const endTick = Math.max(lengthTicks ?? 0, previousTick);
  body.push(...varint(endTick - previousTick), 0xff, 0x2f, 0x00);

  return body;
}

function chunk(id, body) {
  return [
    ...Array.from(id, (character) => character.charCodeAt(0)),
    (body.length >>> 24) & 0xff,
    (body.length >>> 16) & 0xff,
    (body.length >>> 8) & 0xff,
    body.length & 0xff,
    ...body,
  ];
}

export function buildMidi({ ticksPerBeat, tracks, lengthTicks }) {
  const header = chunk('MThd', [
    0x00,
    0x01,
    (tracks.length >>> 8) & 0xff,
    tracks.length & 0xff,
    (ticksPerBeat >>> 8) & 0xff,
    ticksPerBeat & 0xff,
  ]);

  return Uint8Array.from([
    ...header,
    ...tracks.flatMap((track) =>
      chunk('MTrk', serializeTrack(track, lengthTicks)),
    ),
  ]);
}
