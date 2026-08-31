import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMidi, createTrack } from './smf.mjs';
import { parseMidi } from './smf-parse.mjs';

test('reads back a note written by the writer', () => {
  const track = createTrack();
  track.note(0, 60, 96, 100);

  const parsed = parseMidi(buildMidi({ ticksPerBeat: 96, tracks: [track] }));

  assert.equal(parsed.ticksPerBeat, 96);
  assert.equal(parsed.tracks.length, 1);
  assert.deepEqual(parsed.tracks[0], [
    { tick: 0, type: 'noteOn', channel: 0, pitch: 60, velocity: 100 },
    { tick: 96, type: 'noteOff', channel: 0, pitch: 60, velocity: 64 },
    { tick: 96, type: 'endOfTrack' },
  ]);
});

test('reads back multi-byte delta times', () => {
  const track = createTrack();
  track.note(1000, 60, 96, 100);

  const parsed = parseMidi(buildMidi({ ticksPerBeat: 96, tracks: [track] }));

  assert.equal(parsed.tracks[0][0].tick, 1000);
});

test('reads back program, controller and tempo events', () => {
  const track = createTrack(3);
  track.program(0, 46);
  track.controller(0, 7, 100);
  track.tempo(0, 120);

  const parsed = parseMidi(buildMidi({ ticksPerBeat: 96, tracks: [track] }));
  const types = parsed.tracks[0].map((event) => event.type);

  assert.deepEqual(types, ['program', 'controller', 'tempo', 'endOfTrack']);
  assert.equal(parsed.tracks[0][0].program, 46);
  assert.equal(parsed.tracks[0][0].channel, 3);
  assert.equal(parsed.tracks[0][2].bpm, 120);
});

test('separates tracks', () => {
  const first = createTrack(0);
  first.note(0, 60, 96, 100);
  const second = createTrack(1);
  second.note(0, 67, 96, 100);

  const parsed = parseMidi(
    buildMidi({ ticksPerBeat: 96, tracks: [first, second] }),
  );

  assert.equal(parsed.tracks.length, 2);
  assert.equal(parsed.tracks[1][0].pitch, 67);
});
