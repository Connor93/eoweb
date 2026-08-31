import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRACKS } from '../tracks/index.mjs';
import { renderEditorModule } from './editor-manifest.mjs';

test('lists every track as an id/label pair', () => {
  const module = renderEditorModule(TRACKS);

  for (const track of TRACKS) {
    assert.ok(
      module.includes(`id: ${track.id}`),
      `track ${track.id} missing from the generated module`,
    );
  }
});

test('labels a track with its id, title and slug', () => {
  const module = renderEditorModule([
    { id: 17, slug: 'mire', title: 'Mire', usedBy: 'mapgen swamp theme' },
  ]);

  // The editor shows this string in a dropdown, so it has to be readable on
  // its own -- the person picking it is looking at a map, not at this repo.
  assert.match(module, /17 — Mire \(mire\)/);
});

test('carries a do-not-edit header naming its source', () => {
  const module = renderEditorModule(TRACKS);

  assert.match(module, /DO NOT EDIT/i);
  assert.match(module, /sync-editor-music/);
});

test('generates identical output for identical input', () => {
  assert.equal(renderEditorModule(TRACKS), renderEditorModule(TRACKS));
});
