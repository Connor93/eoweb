import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inMode } from './lib/music.mjs';
import { renderTrack } from './lib/render.mjs';
import { TICKS_PER_BEAT } from './lib/score.mjs';
import { parseMidi } from './lib/smf-parse.mjs';
import { TRACKS } from './tracks/index.mjs';

const PERCUSSION_CHANNEL = 9;

/** Lowest and highest pitch any melodic GM patch should be asked to play. */
const LOWEST_MELODIC = 36;
const HIGHEST_MELODIC = 96;

test('every track has a unique id and slug', () => {
  const ids = TRACKS.map((t) => t.id);
  const slugs = TRACKS.map((t) => t.slug);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(ids.every((id) => Number.isInteger(id) && id >= 1 && id <= 999));
});

for (const track of TRACKS) {
  const render = () => renderTrack(track);

  test(`${track.slug}: ends exactly on the loop point`, () => {
    const score = render();
    const parsed = parseMidi(score.toMidi());

    const expected = track.bars * (track.beatsPerBar ?? 4) * TICKS_PER_BEAT;
    for (const events of parsed.tracks) {
      const end = events.find((e) => e.type === 'endOfTrack');
      assert.equal(end.tick, expected);
    }
  });

  test(`${track.slug}: every note is released`, () => {
    const parsed = parseMidi(render().toMidi());

    for (const events of parsed.tracks) {
      const open = new Map();
      for (const event of events) {
        const key = `${event.channel}:${event.pitch}`;
        if (event.type === 'noteOn') {
          // A second note on for a pitch already sounding leaves the first
          // one hanging: the release pairs with the newer note and the older
          // one rings until the sequencer resets.
          assert.ok(!open.has(key), `${track.slug}: overlapping ${key}`);
          open.set(key, event.tick);
        } else if (event.type === 'noteOff') {
          assert.ok(open.has(key), `${track.slug}: unmatched release ${key}`);
          open.delete(key);
        }
      }
      assert.equal(
        open.size,
        0,
        `${track.slug}: ${open.size} notes left ringing`,
      );
    }
  });

  test(`${track.slug}: melodic parts stay in the mode and in range`, () => {
    const parsed = parseMidi(render().toMidi());

    for (const events of parsed.tracks) {
      for (const event of events) {
        if (event.type !== 'noteOn' || event.channel === PERCUSSION_CHANNEL) {
          continue;
        }
        assert.ok(
          inMode(event.pitch, track.tonic, track.mode),
          `${track.slug}: pitch ${event.pitch} is outside ${track.slug}'s mode`,
        );
        assert.ok(
          event.pitch >= LOWEST_MELODIC && event.pitch <= HIGHEST_MELODIC,
          `${track.slug}: pitch ${event.pitch} is outside the playable range`,
        );
      }
    }
  });

  test(`${track.slug}: renders identically twice`, () => {
    assert.deepEqual(render().toMidi(), render().toMidi());
  });

  test(`${track.slug}: loops between 45 and 180 seconds`, () => {
    const beats = track.bars * (track.beatsPerBar ?? 4);
    const seconds = (beats / track.bpm) * 60;

    assert.ok(
      seconds >= 45 && seconds <= 180,
      `${track.slug}: ${seconds.toFixed(1)}s loop is outside the 45-180s band`,
    );
  });

  test(`${track.slug}: has at least two parts`, () => {
    assert.ok(parseMidi(render().toMidi()).tracks.length >= 3);
  });
}
