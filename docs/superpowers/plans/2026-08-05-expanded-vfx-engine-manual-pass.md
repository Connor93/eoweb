# Expanded Skill VFX Engine — Manual Verification Pass

> Human/controller pass, not a subagent task — needs a browser, a running
> reoserv dev server, and eyes on two canvases (the game and the editor
> preview). Companion to the automated gates (`pnpm vfx:check`, `pnpm
> vfx:parity`, `tsc`, `biome`), which already prove the registry is well-formed
> and the vendored copy hasn't drifted. This pass proves the pixels actually
> look right and match between the two apps.

## ⚠️ Correction to the plan/spec docs

Both `docs/superpowers/plans/2026-08-05-expanded-vfx-engine.md` and its
companion spec use **`impact-water-lg`** as a running example effect name.
**That name does not exist and never has.** `impact` was shorthand for the
*impact-role group* of kinds in the plan author's head, not an actual
`ShapeKind`. Every real effect name follows `<kind>-<element>[-<size>]`, where
`kind` is one of the 15 values in `ShapeKind` (`ring`, `disc`, `spark-burst`,
`slash`, `spiral`, `sparkle`, `nova`, `shockwave`, `beam-pop`, `implode`,
`vortex`, `rain`, `chains`, `orbit`, `burst-lines`). Step 7 below turns this
into a deliberate test case instead of silently working around it.

Every effect name used below was checked against a live `buildRegistry()` call
(`pnpm exec tsx scripts/vfx-registry-parity-check.ts` imports it; see the
verification transcript in `task-6-report.md` for the exact pass/fail table).
None of these were picked "by eye."

## Prerequisites

- reoserv running against its normal dev config (`cargo run` from
  `/Users/cfraser/Projects/reoserv`), with a character that can reach an NPC
  to hit (any live map with a mob works — `impact_vfx` only plays if the
  skill actually connects with a target).
- eoweb dev server running (`pnpm dev` from `/Users/cfraser/Projects/eoweb`),
  logged in with that character.
- aio-editor running both halves (`npm run dev:backend` then
  `npm run dev:frontend` from `/Users/cfraser/Projects/aio-editor`), skills
  section open.
- The skill pub `reoserv/data/pub/skills/strike.json` as the scratch skill —
  it's already offensive (`"target": "single_enemy"`), has both `cast_vfx`
  and `impact_vfx` populated, and its **current values are the legacy
  `cast-burst` / `fire-impact` pair**, which doubles as step 6 below. Note
  its current content before you start editing so you can put it back:
  ```json
  "cast_vfx": "cast-burst",
  "impact_vfx": "fire-impact"
  ```
  reoserv hot-reloads pub edits — no restart needed between rounds, just
  save the file and re-cast. **Do not leave `strike.json` in a modified
  state when you're done** — restore the two lines above as the last step.

## eoweb pass (in-game rendering)

For each round: edit `cast_vfx`/`impact_vfx` in `strike.json` to the pair
below, save, cast Strike at an NPC, and confirm both effects render — one at
your caster's feet on cast, one at the target on hit.

| # | Covers | `cast_vfx` | `impact_vfx` | Expect |
|---|---|---|---|---|
| 1 | plain matrix + size variant (the corrected running example) | `cast-arcane` | `disc-water-lg` | A purple-ish spiral swirls on cast; a large pale-blue disc pulses on the target. |
| 2 | a slash | `slash-wind` | `slash-fire-lg` | A yellow arc swipe on cast; a larger orange arc swipe on the target. |
| 3 | a nova | `nova-fire` | `nova-earth-lg` | A bright orange radial flash + ring on cast; a larger green-ish version on the target. |
| 4 | a combo | `ring-slash-wind` | `nova-sparkle-fire` | A yellow ring with a slash swipe layered on top on cast; an orange nova with twinkling sparkles layered on top on the target. |
| 5 | a special | `heal-glow` | `stun-stars` | A soft green glow on cast (normally used for heals — fine to reuse here, it's just a shape+color+timing tuple); yellow dots orbiting the target. |
| 6 | legacy sheet-backed names still work | `cast-burst` | `fire-impact` | These are the file's original values — the curated CC0 sprite-sheet burst on cast, the curated fire flicker on the target (NOT vfx-engine draws — this is the pre-existing sheet path, confirming it wasn't broken by the engine work). |
| 7 | graceful degradation on an invalid name | `impact-water-lg` | `impact-water-lg` | **Nothing renders. No error, no crash, no console warning.** The skill still deals damage/hits normally — only the VFX is silently absent. This is the exact typo the plan/spec docs made; it should fail exactly as quietly as any other unknown ref. |

Also confirm while doing the above:
- **`buff-aura` still renders** — it's no longer a manifest sheet entry (it
  moved into the vfx-engine as a `SPECIALS` def during Task 3), so if you
  have any skill/status that plays `buff-aura` (or temporarily set
  `cast_vfx: "buff-aura"` on `strike.json` for one extra round), confirm it
  still shows an amber ring pulse — same visual contract as before, now
  generated instead of hand-authored.
- **Startup is not visibly slower.** Reload the eoweb tab and watch the
  loading screen — only the 2 curated sheets (`cast-burst`, `fire-impact`)
  preload up front; the other 379 procedural effects rasterize lazily on
  first use (a few Canvas2D draws per cast — imperceptible). If you see a
  new stall on load, that's a regression worth filing, not something to wave
  through.

When done, restore `strike.json` to its original `cast-burst` / `fire-impact`
pair (round 6's values) and confirm `git status` in reoserv shows no residual
diff you introduced beyond what was already there before this pass (reoserv
already carries unrelated uncommitted WIP — leave that alone; just make sure
your edits net out to zero).

## aio-editor pass (authoring preview)

1. Open a skill in the form editor (`strike` is fine, or any other) and
   locate the `cast_vfx` field.
2. Confirm the `<datalist>` suggestion dropdown offers the full palette —
   typing `nova-` should surface all 7 elements × 3 sizes plus the
   `nova-sparkle` / `nova-burst-lines` combos (21 + 14 = 35 matches). This is
   `VFX_SUGGESTIONS` from `suggest-values.ts`, generated from
   `buildRegistry()` plus the 2 legacy sheet names — not hand-maintained.
3. Type or pick each of the 5 real names from rounds 1-5 above in turn
   (`cast-arcane`, `slash-wind`, `nova-fire`, `ring-slash-wind`,
   `heal-glow`) into `cast_vfx`. For each: confirm the **preview canvas**
   (128×128, dark checker background) animates and that its shape/color/
   timing **visually matches** what you just saw render in-game for that
   same name in the eoweb pass. Use the ▶/⏸ button — pausing should freeze
   the current frame (if it visibly resets to frame 0 instead, that's a
   known deferred minor from Task 5's review, not a Task 6 regression —
   note it but don't block on it).
4. Type `cast-burst` (a legacy sheet name, not a generated def) into
   `cast_vfx`. Confirm the preview area shows the **muted "no preview
   (sheet/unknown)" state** instead of a blank canvas or an error — this is
   the documented, deliberate degradation for sheet-backed names the
   procedural registry doesn't know about.
5. Type the deliberately invalid `impact-water-lg` into `impact_vfx`.
   Confirm it *also* shows the muted "no preview" state — same code path as
   a typo, same as step 4, proving the editor degrades exactly like the game
   does (nothing renders, nothing errors).
6. Open an **item** and an **NPC** form (any entries). Confirm they render
   normally with no `VfxPreview` widget anywhere and no console errors —
   `isVfxPath()` only matches fields whose path ends in `cast_vfx` or
   `impact_vfx`, so this should be a no-op change for every other pub type.

## Sign-off

Record in the vault ([[AIO Editor]] / [[Eoweb]] gotchas or the vfx planning
note, per the user's usual session wrap-up) whether all of the above matched
expectations, and flag anything that didn't — this doc doesn't self-certify;
a human needs to actually watch the canvases and say so.
