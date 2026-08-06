# EO-Idiom VFX Rework — Manual Verification Pass

> Human/controller pass, not a subagent task — needs a browser, a running
> reoserv dev server, and eyes on two canvases (the game and the editor
> preview). Companion to the automated gates (`pnpm exec tsc --noEmit`,
> `pnpm exec biome check src/vfx-engine src/render/vfx scripts`, `pnpm
> vfx:check`, `pnpm vfx:parity`, and the aio-editor `tsc`), which already
> prove the registry is well-formed, the extent budget holds, and the
> vendored copy hasn't drifted. **None of those gates can tell you whether
> the pixels actually read as the intended shapes once quantised to a
> 44px raster** — that is what this pass is for, and nobody has looked at
> any of it in a browser before this task.

## Every name/label below was checked, not picked by eye

The predecessor VFX projects each shipped a doc whose running example
(`impact-water-lg`) never existed — `impact` was never a real shape kind.
To not repeat that, every name and shape label cited below was verified
against a live `buildRegistry()` / `buildIndex()` / `buildShapes()` call
(`pnpm exec tsx .superpowers/verify-vfx-names-t8.ts` from `eoweb/`, a
throwaway git-ignored script — not part of the repo). Output:

```
## Registry names (buildRegistry() / buildIndex())

| name               | in registry | in index | frames | loops | frameMs | kind        |
|--------------------|-------------|----------|--------|-------|---------|-------------|
| ring-fire          | true        | true     | 4      | 1     | 100     | ring        |
| ring-light         | true        | true     | 4      | 1     | 100     | ring        |
| ring-wind          | true        | true     | 4      | 1     | 100     | ring        |
| ring-neutral       | true        | true     | 4      | 1     | 100     | ring        |
| shockwave-water    | true        | true     | 4      | 1     | 100     | shockwave   |
| nova-fire          | true        | true     | 4      | 1     | 100     | nova        |
| spiral-fire        | true        | true     | 4      | 3     | 100     | spiral      |
| crit-flash         | true        | true     | 4      | 1     | 60      | nova        |
| buff-aura          | true        | true     | 4      | 3     | 100     | ring        |
| heal-glow          | true        | true     | 4      | 3     | 100     | disc        |
| chains-dark        | true        | true     | 4      | 3     | 100     | chains      |
| burst-lines-fire   | true        | true     | 4      | 1     | 100     | burst-lines |
| sparkle-water      | true        | true     | 4      | 3     | 100     | sparkle     |

## Sheet names (SHEET_DEFS — resolved OUTSIDE buildRegistry(), via SHEETS in vfx-manifest.ts)

| name         | in SHEET_DEFS | in buildRegistry() (should be false) |
|--------------|---------------|---------------------------------------|
| cast-burst   | true          | false                                  |
| fire-impact  | true          | false                                  |

## Shape picker labels (buildShapes() — 31 total = 15 kinds + 8 combos + 8 specials)

Ring, Disc, Spark Burst, Slash, Nova, Shockwave, Implode, Burst Lines,
Sparkle, Spiral, Vortex, Orbit, Chains, Rain, Beam Pop
— all 15 present, all hasElement=true/hasSize=true (matrix layer).

## Timing sanity
nova-fire:   frames=4 loops=1 frameMs=100 -> totalMs=400
spiral-fire: frames=4 loops=3 frameMs=100 -> totalMs=1200
crit-flash:  frames=4 loops=1 frameMs=60  -> totalMs=240
```

## Prerequisites

- reoserv running against its normal dev config (`cargo run` from
  `/Users/cfraser/Projects/reoserv`), with a character that can reach an NPC
  to hit (needed for steps 2-8; not needed for step 1).
- eoweb dev server running (`pnpm dev` from `/Users/cfraser/Projects/eoweb`),
  logged in with that character (needed for steps 2-8).
- aio-editor running both halves (`npm run dev:backend` then `npm run
  dev:frontend` from `/Users/cfraser/Projects/aio-editor`), skills section
  open (needed for step 1 only — you do not need reoserv or eoweb running
  for that step).
- The skill pub `reoserv/data/pub/skills/strike.json` as the scratch skill
  for steps 2-8 — it's already offensive (`"target": "single_enemy"`), has
  both `cast_vfx` and `impact_vfx` populated, and its **current values are
  the legacy `cast-burst` / `fire-impact` pair**:
  ```json
  "cast_vfx": "cast-burst",
  "impact_vfx": "fire-impact"
  ```
  reoserv hot-reloads pub edits — no restart needed between rounds, just
  save the file and re-cast. **Do not leave `strike.json` in a modified
  state when you're done** — step 9 restores it, and is not optional.

## Calibration: what a designed fade looks like vs. a broken one

Read this before judging any step below a failure — the pixel pipeline
makes some fading behavior look alarming even though it is exactly as
designed.

Every kind samples its 4-frame cycle at a **midpoint** progress
(`frameProgress`: `(frameIndex + 0.5) / frames`), and most kinds use
`globalAlpha = 1 - progress` (or a close variant). That means **frame 3 of
a 4-frame cycle sits at progress ≈ 0.875, alpha ≈ 0.125** — low enough that
`quantizeToRamp`'s luminance-times-coverage cutoff drops it to fully
transparent for most elements. This is **not breakage**. It reproduces on
9 of the 15 kinds regardless of `loops`: `ring`, `shockwave`, `disc`,
`nova`, `spark-burst`, `vortex`, `burst-lines`, `chains`, and (partially)
`spiral`. A **sustained** kind (`loops: 3`, e.g. `chains`, `spiral`) fades
to near-nothing and snaps back to bright **three times** over its 1200ms
life — that pulsing is the intended "flicker"/"pulse" read for those kinds,
not a bug repeating itself.

The other 6 kinds (`sparkle`, `rain`, `orbit`, `beam-pop`, `implode`,
`slash`) use staggered per-particle phases or non-decaying alpha formulas
and never go fully blank on any frame — if one of *those* six blanks out,
that is a real regression.

**What genuine break-up looks like, and what to flag:** a shape that reads
as a faint scatter of disconnected dots/dashes instead of a cohesive
line/curve on frames *other* than the last one of a cycle; a shape that is
so faint at S size you have to squint to tell it's there even at its
brightest frame; or visible flicker where individual pixels along a stroke
wink in and out frame-to-frame at the *same* progress you'd expect it
solid. A hard square-edged clip (a circle or streak cut off flat instead of
tapering) is a **different, already-automated** concern (the Chebyshev
extent budget, checked by `vfx:check`/the instrumented extent scripts) —
if you see one, it's still worth flagging, but it did not come from this
task's quantisation work and every kind currently measures under budget.

## Step 1: All 15 kinds, break-up survey (aio-editor only)

Open any skill in the form editor (`strike` is fine) and find the
`cast_vfx` field. For each of the 15 shape labels below, in order: select
it from the shape dropdown, pick any element (fire is a reasonable
default, its base rung is one of the brighter ones), then click through
**S, M, L** on the size row, watching the preview for at least one full
cycle (up to 1.2s) at each size.

| Kind | Note |
|---|---|
| Ring | Front-only concern here — ground-plane depth is step 2, not this step. |
| Disc | — |
| Spark Burst | — |
| Slash | Never goes fully blank (see calibration note) — a blank frame here is a real regression. |
| Nova | — |
| Shockwave | Front-only concern here — ground-plane depth is step 2. |
| Implode | Never goes fully blank — brightens as it collapses. |
| **Burst Lines** | **Retuned this task** (16→12 lines, stroke 1.5→3.5) — previously several elements' mid-cycle frame collapsed to *literally zero* painted pixels. Confirm it now reads as a clear radiating speed-line burst at every size, not a faint blur. |
| Sparkle | Never goes fully blank. This kind was suspected as a likely casualty going in but measured fine — confirm the twinkle diamonds are legible at S size, not just a smudge. |
| Spiral | Frame 0 of every cycle is *supposed* to look nearly empty (it grows from the center) — that is not a failure. |
| Vortex | — |
| Orbit | Never goes fully blank — dots should stay visible the whole cycle. |
| **Chains** | **Retuned this task** (stroke 2→3.5) — previously the zigzag largely vanished by the second frame of its cycle, worst on the `dark` element. Confirm the lightning zigzag is now clearly visible through most of its cycle at every size. `dark` will still read as the dimmest of the 7 elements (its base rung has the lowest luminance in the palette) — a dimmer-but-present zigzag is fine; a vanished one is not. |
| Rain | Never goes fully blank. |
| Beam Pop | Never goes fully blank; reads as one solid hue by design (it's a plain vertical gradient of a single rung, not multiple rungs) — that is expected, not a break-up. |

**Expect:** every kind holds a recognisable, readable shape at every size
on at least 2 of its 4 frames (per the calibration note, a designed blank
tail frame doesn't count against this) — no shape that reads as scattered
noise or is invisible against the dark checker background at its brightest
frame.

**Failure looks like:** any kind above marked "never goes fully blank"
shows an actually-empty preview at any point in its cycle; `Chains` or
`Burst Lines` still look thin/broken at any size (the fix not actually
working, despite the automated survey saying otherwise — a live look is
the point of this pass); or any kind shows a hard square-edged clip.

## Step 2: `ring` / `shockwave` ground-plane depth (in-game)

Edit `strike.json`:
```json
"cast_vfx": "ring-fire",
"impact_vfx": "shockwave-water"
```
Save, cast Strike at an NPC, and watch both your own feet (cast) and the
target (impact) closely — these effects are small and fast (400ms).
Repeat the cast a few times if you need more looks.

**These are the *only* two of the 15 kinds with `behind`/`tint` content —
the other 13 are `front`-only by design**, not an oversight: they're
either overhead bursts (nova, spark-burst, disc), directional swipes/beams
(slash, beam-pop), or effects with no natural "standing on the ground
around a character" read (spiral, vortex, chains, etc.), so a ground-plane
split wouldn't mean anything for them. `ring`/`shockwave` are the two
exemplars chosen specifically because they're ground-anchored expanding
rings, where "goes around the character's feet" is the correct read.

**Expect:** the **far side** of the ring/ellipse (top, on screen) is
partly hidden behind your character/the target's sprite as it expands —
you should NOT see a complete, unbroken ellipse floating in front of
everything; the **near side** (bottom, toward the viewer) draws clearly
over the character's feet/shoes; and there is a brief colour **flash on
the character sprite itself** (additive-blended, not a separate detached
shape off to the side) timed with the ring/shockwave's early frames.

**Failure looks like:** you can see a complete, unbroken ellipse with no
part of it occluded by the character (the far/near z-order split isn't
actually rendering — everything is on one layer); the near and far arcs
are swapped (far arc draws OVER the character instead of behind); or no
tint/flash appears on the sprite at all.

## Step 3: Cadence — repeat vs. one-shot feel (in-game)

Edit `strike.json`:
```json
"cast_vfx": "spiral-fire",
"impact_vfx": "nova-fire"
```
Save and cast Strike at an NPC several times, watching the **cast** effect
(`spiral-fire`, at your own feet) run its full 1200ms, and the **impact**
effect (`nova-fire`, on the target) run its full 400ms.

**Expect:** `spiral-fire` visibly **grows from center, fades, and resets
back to center three separate times** over its ~1.2s life — three short
pulses, not one slow continuous burn. `nova-fire` reads as a **quick,
punchy pop** — flash, ring, gone — comparable in snappiness to a normal
attack hit, not a lingering glow. (Optional extra: temporarily set
`impact_vfx` to `crit-flash`, 240ms, for a side-by-side sense of "as fast
as this cadence system gets.")

**Failure looks like:** `spiral-fire` plays through what looks like ONE
long, slow growth over the whole 1.2 seconds with no visible reset/repeat
partway through — this is the exact "plan gap" bug an earlier task in this
series found and fixed (nothing looped the cycle; a sustained effect just
played once, stretched over the longer duration). If it's back, that's a
real regression, not a feel nitpick. Also flag `nova-fire` if it feels like
it drags or lingers noticeably longer than a normal hit reaction.

## Step 4: ⚠ THE BLOCKING CHECK — does the tint layer read as a glow or a blob?

This is the one check in this pass that must not be waved through as
"reasoned about but never looked at." `quantizeToRamp` maps every painted
pixel onto 4 ramp rungs **at full alpha** — so the low-alpha wash `tint`
was authored with (a soft, translucent glow in the pre-quantisation design)
resolves post-quantisation to either a **solid shadow-rung flash** or
nothing, never a gradient. Measured shadow-rung luminance per element:
`dark` 0.13 (near-black, genuinely close to a no-op), but **`light` 0.42,
`wind` 0.34, `neutral` 0.33** — a golden-brown patch at 33-42% luminance,
added at full opacity, is not negligible, and it survives **3 of the 4
frames** for `light` and `neutral` specifically (not just a single flicker
frame).

Edit `strike.json`, casting each of these three in turn at an NPC (`ring`
is the one specified — its `tint` pass is identical in mechanism to
`shockwave`'s, so one kind covering all three flagged elements is enough):
```json
"cast_vfx": "ring-light",
```
then
```json
"cast_vfx": "ring-wind",
```
then
```json
"cast_vfx": "ring-neutral",
```
Watch the character sprite itself (not the ring shape) each time.

**Expect / judge:** for each of the three, decide — does the flash on the
sprite read as an intentional highlight/glow effect, or as an ugly, flat
patch of solid colour sitting on the character? There is no automated pass
condition here; this is a subjective call the pipeline's design explicitly
cannot make for you.

**Failure looks like, and what to do about it:** if any of the three reads
as an ugly solid-colour blob rather than a glow, **do not silently accept
it and move on**. Record which element(s) failed and pick one of the two
honest fixes for a follow-up task: **(a)** exempt the `tint` layer from
`quantizeToRamp` entirely (let it stay a smooth low-alpha wash instead of
snapping to a ramp rung), or **(b)** drop `tint` from the two exemplar
kinds' definitions until a version of quantisation that tolerates a soft
wash exists. Either is legitimate; picking neither and shipping the blob
is not.

## Step 5: Sheet-backed effects still animate, unchanged

Edit `strike.json` back to its original values:
```json
"cast_vfx": "cast-burst",
"impact_vfx": "fire-impact"
```
Cast Strike at an NPC.

**Expect:** the curated CC0 sprite-sheet burst plays on cast (an expanding
blue-white ring) and the curated fire flicker plays on impact — identical
in look and timing to before this task. These are real PNG frame-strips
(`sheets.ts`/`SHEET_DEFS`), not vfx-engine draws, so none of this task's
`kinds.ts` changes should touch them at all.

**Failure looks like:** either sheet effect looks different than you
remember from before this rework, is missing, chopped, or shows a "sheet
image failed to load" placeholder — any of those means something in this
task's changes leaked into the sheet path, which should be impossible
given `kinds.ts` is the only file this task edited.

## Step 6: `buff-aura` still renders

Temporarily set (any skill/status field that plays it works; `strike.json`
is fine for a one-off look):
```json
"cast_vfx": "buff-aura",
```
Cast it.

**Expect:** an amber ring pulse, sustained over ~1.2s (it's `loops: 3`) —
the same visual contract as before it moved from a hand-authored manifest
sheet entry into a generated vfx-engine "special" (`kind: ring`, its own
hardcoded ramp) in an earlier task in this series.

**Failure looks like:** nothing renders, an error appears, or the pulse
looks nothing like an amber ring (e.g. shows as the wrong shape/colour
entirely) — would mean the special-effect path broke somewhere between
that earlier task and this one.

## Step 7: Startup not visibly slower

Reload the eoweb tab and watch the loading screen.

**Expect:** only the 2 curated sheets (`cast-burst`, `fire-impact`)
preload up front. The other 379 procedural effects — including the two
retuned this task — rasterize lazily on first use (a handful of Canvas2D
draws per cast), which is imperceptible. Load time should look the same as
it did before this task.

**Failure looks like:** a new, noticeable stall on load that wasn't there
before — worth filing as a regression, not something to wave through as
"probably fine."

## Step 8: Cosmetic edge — burst depth snapshot (informational, does not block)

A `SkillBurst`'s three sprites derive their z-order once, from the
target's `zIndex` at the moment `playBurst` is called
(`src/handlers/skill.ts:120` → `MapRenderer.getEntityZIndex`,
`src/map.ts:2377`) — see `SkillBurst.reset` in
`src/render/vfx/skill-burst.ts`. It is never re-derived for the rest of
the burst's life.

Edit `strike.json`:
```json
"impact_vfx": "spiral-fire",
```
(1200ms, long enough to walk during). Cast Strike at an NPC that is
actively walking/patrolling, ideally landing the hit just as it's about to
step to a different row/depth on screen.

**Expect / record:** the burst's depth relative to the target may visibly
fall out of sync partway through its 1.2s life if the target walks during
it — e.g. the effect appears to render in front of the target when it
should now be behind it, or vice versa, once the target has moved. This
was flagged and accepted as a known, rare cosmetic edge during an earlier
task in this series (matches pre-existing position-snapshot behavior for
other one-shot effects, not a new shortcut introduced here) — it does
**not** block this pass. Just confirm it's the mild, occasional artifact
described here and not something worse (e.g. the burst never rendering at
all, or persisting after the target despawns).

**Failure looks like:** anything beyond the described mild z-order
drift — a crash, a burst that never disappears, or a burst that renders
nowhere near the target — would be a different, real bug and should be
escalated rather than filed under this known limitation.

## Step 9: Restore

Set `strike.json` back to its step-5 values if you changed anything after
that step:
```json
"cast_vfx": "cast-burst",
"impact_vfx": "fire-impact"
```
Then from a terminal:
```
git -C /Users/cfraser/Projects/reoserv status --short
```

**Expect:** exactly the two pre-existing WIP lines that were already there
before this pass —
```
 M data/pub/npcs/0007.json
 M data/pub/skills/rage.json
```
— and nothing mentioning `strike.json` or anything else.

**Failure looks like:** `data/pub/skills/strike.json` (or any other file)
shows up in that status output. If it does, re-edit `strike.json` to the
exact two lines above, save, and re-check before considering this pass
done.

---

## Sign-off

Record in the vault ([[Eoweb]] / VFX planning note, per the user's usual
session wrap-up) whether all of the above matched expectations, and flag
anything that didn't — **especially step 4**, which has no automated
substitute and is the one thing in this entire rework nobody has actually
looked at yet. This doc doesn't self-certify; a human needs to watch the
canvases and say so.
