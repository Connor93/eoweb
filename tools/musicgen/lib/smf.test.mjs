import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMidi, createTrack } from './smf.mjs';

const hex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');

test('emits a spec-exact single-note file', () => {
  const track = createTrack();
  track.note(0, 60, 96, 100);

  const bytes = buildMidi({ ticksPerBeat: 96, tracks: [track] });

  // Hand-computed from the Standard MIDI File spec:
  //   MThd, len 6, format 1, 1 track, 96 ticks/beat
  //   MTrk, len 12
  //     delta 0x00  90 3c 64   note on  ch0 C4 vel100
  //     delta 0x60  80 3c 40   note off ch0 C4 vel64   (96 ticks later)
  //     delta 0x00  ff 2f 00   end of track
  assert.equal(
    hex(bytes),
    '4d 54 68 64 00 00 00 06 00 01 00 01 00 60 ' +
      '4d 54 72 6b 00 00 00 0c ' +
      '00 90 3c 64 60 80 3c 40 00 ff 2f 00',
  );
});

test('encodes deltas above 127 as multi-byte varints', () => {
  const track = createTrack();
  track.note(192, 60, 96, 100);

  const bytes = buildMidi({ ticksPerBeat: 96, tracks: [track] });

  // 192 decimal = 0b1_1000_0000 -> varint 0x81 0x40.
  assert.ok(
    hex(bytes).includes('81 40 90 3c 64'),
    `expected a 0x81 0x40 delta before the note on, got: ${hex(bytes)}`,
  );
});

test('orders note off before note on at the same tick', () => {
  const track = createTrack();
  // Deliberately added out of order: a tick-only sort would leave the
  // re-attack ahead of the release and silence the second note.
  track.note(96, 60, 96, 100);
  track.note(0, 60, 96, 100);

  const bytes = buildMidi({ ticksPerBeat: 96, tracks: [track] });

  // A repeated pitch must release before it re-attacks; the other order
  // silences the note that just started.
  const offAt96 = hex(bytes).indexOf('80 3c 40');
  const onAt96 = hex(bytes).lastIndexOf('90 3c 64');
  assert.ok(
    offAt96 < onAt96,
    `note off must precede the re-attack, got: ${hex(bytes)}`,
  );
});

test('honours an explicit lengthTicks for the end-of-track', () => {
  const track = createTrack();
  track.note(0, 60, 96, 100);

  const bytes = buildMidi({
    ticksPerBeat: 96,
    lengthTicks: 384,
    tracks: [track],
  });

  // The loop point is the end-of-track meta, so a track whose content stops
  // early must still pad to the full bar count or the loop turns over short.
  assert.ok(
    hex(bytes).endsWith('82 20 ff 2f 00'),
    `expected a 288-tick pad before end-of-track, got: ${hex(bytes)}`,
  );
});

test('emits a program change', () => {
  const track = createTrack();
  track.program(0, 46);

  const bytes = buildMidi({ ticksPerBeat: 96, tracks: [track] });

  assert.ok(hex(bytes).includes('00 c0 2e'), hex(bytes));
});

test('emits a controller change', () => {
  const track = createTrack();
  track.controller(0, 7, 100);

  const bytes = buildMidi({ ticksPerBeat: 96, tracks: [track] });

  assert.ok(hex(bytes).includes('00 b0 07 64'), hex(bytes));
});

test('emits tempo as microseconds per quarter note', () => {
  const track = createTrack();
  track.tempo(0, 120);

  const bytes = buildMidi({ ticksPerBeat: 96, tracks: [track] });

  // 60_000_000 / 120 = 500_000 us = 0x07a120.
  assert.ok(hex(bytes).includes('ff 51 03 07 a1 20'), hex(bytes));
});

test('emits a time signature with a power-of-two denominator', () => {
  const track = createTrack();
  track.timeSignature(0, 6, 8);

  const bytes = buildMidi({ ticksPerBeat: 96, tracks: [track] });

  // 6/8: numerator 6, denominator exponent 3, 24 clocks/click, 8 32nds/quarter.
  assert.ok(hex(bytes).includes('ff 58 04 06 03 18 08'), hex(bytes));
});

test('emits a track name', () => {
  const track = createTrack();
  track.name('Town');

  const bytes = buildMidi({ ticksPerBeat: 96, tracks: [track] });

  assert.ok(hex(bytes).includes('ff 03 04 54 6f 77 6e'), hex(bytes));
});

test('rejects a pitch outside the MIDI range', () => {
  const track = createTrack();

  assert.throws(() => track.note(0, 128, 96, 100), /pitch/);
});

test('rejects a velocity outside the MIDI range', () => {
  const track = createTrack();

  assert.throws(() => track.note(0, 60, 96, 200), /velocity/);
});

test('rejects a non-positive note duration', () => {
  const track = createTrack();

  // A zero-length note is inaudible but still emits an on/off pair, so it
  // silently bloats the file and confuses the loop-seam check.
  assert.throws(() => track.note(0, 60, 0, 100), /duration/);
});

test('rejects a channel outside 0-15', () => {
  assert.throws(() => createTrack(16), /channel/);
});
