import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODES } from './music.mjs';
import { renderTrack } from './render.mjs';
import { parseMidi } from './smf-parse.mjs';

const trackWith = (gain) => ({
  id: 99,
  slug: 'probe',
  title: 'Probe',
  tonic: 62,
  mode: MODES.dorian,
  bpm: 80,
  bars: 4,
  gain,
  compose(score) {
    score
      .part({ name: 'Harp', channel: 0, program: 46, volume: 50 })
      .note(0, 0, 1, 40);
  },
});

const volumeOf = (track) =>
  parseMidi(renderTrack(track, 1).toMidi())
    .tracks.flat()
    .find((event) => event.type === 'controller' && event.cc === 7).value;

test('applies a per-track gain trim on top of the master gain', () => {
  // A sparse track renders far quieter than a busy one at the same master
  // gain, so each descriptor may trim itself back toward the target level.
  assert.equal(volumeOf(trackWith(2)), 100);
});

test('leaves a track untrimmed when it declares no gain', () => {
  assert.equal(volumeOf(trackWith(undefined)), 50);
});
