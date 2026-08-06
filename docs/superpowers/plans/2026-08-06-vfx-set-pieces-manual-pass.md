# VFX Set Pieces — Manual Verification Pass

> Human/controller pass, not a subagent task — needs a browser, a running
> reoserv dev server, and eyes on two canvases (the game and the editor
> preview). Companion to the automated gates (`pnpm exec tsc --noEmit`,
> `pnpm exec biome check src/vfx-engine src/render/vfx scripts`, `pnpm
> vfx:check`, `pnpm vfx:parity`, and the aio-editor `tsc`), which already
> prove the registry is well-formed (407 names / 35 shapes / round-trip OK),
> the extent budget holds, and the vendored copy hasn't drifted. **None of
> those gates can tell you whether a rock reads as falling instead of
> teleporting, whether the impact lands in sync with the damage number, or
> whether the tint flash looks like a glow or a blob** — that is what this
> pass is for, and nobody has looked at any of it in a browser before this
> task.

## Every name/label below was checked, not picked by eye

Three predecessor VFX projects' manual-pass docs each open with this same
warning, because the very first one shipped a doc whose running example
(`impact-water-lg`) never existed — `impact` was never a real shape kind.
To not repeat that a fourth time, every name and shape label cited below was
verified against a live `buildRegistry()` / `buildIndex()` / `buildShapes()`
call (`pnpm exec tsx .superpowers/verify-vfx-names-t7.ts` from `eoweb/`, a
throwaway git-ignored script — not part of the repo). Output:

```
# Effect-name / shape verification for the Task 7 manual-pass doc

Total registry size: 407 (expect 407)
Total shapes: 35 (expect 35 = 15 kinds + 8 combos + 8 specials + 4 set pieces)

## Set piece names cited in the doc (buildRegistry() / buildIndex())

| name                 | in registry | in index | frames | loops | frameMs | kind         | frame(outW x outH) | anchorY | expected |
|----------------------|-------------|----------|--------|-------|---------|--------------|---------------------|---------|----------|
| bolt-fire            | true        | true     | 4      | 1     | 100     | bolt         | 132x264             | 0.75    | EXISTS   |
| bolt-water           | true        | true     | 4      | 1     | 100     | bolt         | 132x264             | 0.75    | EXISTS   |
| bolt-wind            | true        | true     | 4      | 1     | 100     | bolt         | 132x264             | 0.75    | EXISTS   |
| smite-earth          | true        | true     | 4      | 1     | 100     | smite        | 132x264             | 0.75    | EXISTS   |
| smite-light          | true        | true     | 4      | 1     | 100     | smite        | 132x264             | 0.75    | EXISTS   |
| smite-dark           | true        | true     | 4      | 1     | 100     | smite        | 132x264             | 0.75    | EXISTS   |
| rockfall-neutral     | true        | true     | 4      | 1     | 100     | rockfall     | 132x264             | 0.75    | EXISTS   |
| rockfall-earth       | true        | true     | 4      | 1     | 100     | rockfall     | 132x264             | 0.75    | EXISTS   |
| rockfall-fire        | true        | true     | 4      | 1     | 100     | rockfall     | 132x264             | 0.75    | EXISTS   |
| ring-of-fire-fire    | true        | true     | 4      | 3     | 100     | ring-of-fire | 132x132             | 0.5     | EXISTS   |
| ring-of-fire-water   | true        | true     | 4      | 3     | 100     | ring-of-fire | 132x132             | 0.5     | EXISTS   |
| ring-of-fire-wind    | true        | true     | 4      | 3     | 100     | ring-of-fire | 132x132             | 0.5     | EXISTS   |

## Absence checks (matrix suffixes on set pieces must NOT exist)

| name             | in registry | expected |
|------------------|-------------|----------|
| bolt-fire-sm     | false       | ABSENT   |
| bolt-fire-lg     | false       | ABSENT   |
| smite-earth-lg   | false       | ABSENT   |
| rockfall-fire-sm | false       | ABSENT   |

## Sheet names (unaffected by this project)

| name         | in SHEET_DEFS | in buildRegistry() | expected                  |
|--------------|----------------|---------------------|----------------------------|
| cast-burst   | true           | false               | SHEET, absent from registry |
| fire-impact  | true           | false               | SHEET, absent from registry |

## Set-piece shape picker labels (buildShapes(), layer=setpiece)

Set-piece shapes: 4 (expect 4)

| id                     | label        | hasElement | hasSize |
|------------------------|--------------|------------|---------|
| setpiece:bolt          | Bolt         | true       | false   |
| setpiece:smite         | Smite        | true       | false   |
| setpiece:rockfall      | Rockfall     | true       | false   |
| setpiece:ring-of-fire  | Ring Of Fire | true       | false   |

## Tint layer presence (the inherited tint question applies to these)

| kind          | has tint draw fn |
|---------------|-------------------|
| bolt          | true              |
| smite         | true              |
| rockfall      | true              |
| ring-of-fire  | false             |

## Step 7 spot-check names (pre-existing, must be unaffected)

| name                 | in registry | in index | expected |
|----------------------|-------------|----------|----------|
| nova-fire-lg         | true        | true     | EXISTS   |
| ring-water           | true        | true     | EXISTS   |
| slash-earth-sm       | true        | true     | EXISTS   |
| chains-dark          | true        | true     | EXISTS   |
| spiral-light         | true        | true     | EXISTS   |
| burst-lines-wind-lg  | true        | true     | EXISTS   |
| disc-neutral         | true        | true     | EXISTS   |
| crit-flash           | true        | true     | EXISTS   |
| buff-aura            | true        | true     | EXISTS   |
| heal-glow            | true        | true     | EXISTS   |
```

`ring-of-fire` deliberately has **no** `tint` layer — a sustained, 3-loop
ground ring would strobe the character's sprite three times if it did, so
`KINDS['ring-of-fire'].draw.tint` is simply absent. The inherited tint
question (Step 9 below) applies to `bolt`, `smite`, and `rockfall` only.

## Prerequisites

- reoserv running against its normal dev config (`cargo run` from
  `/Users/cfraser/Projects/reoserv`), with a character that can reach an NPC
  to hit (needed for steps 1-5, 7-9; not needed for step 6).
- eoweb dev server running (`pnpm dev` from `/Users/cfraser/Projects/eoweb`),
  logged in with that character (needed for steps 1-5, 7-9).
- aio-editor running both halves (`npm run dev:backend` then `npm run
  dev:frontend` from `/Users/cfraser/Projects/aio-editor`), skills section
  open (needed for step 6 only — you do not need reoserv or eoweb running
  for that step).
- The skill pub `reoserv/data/pub/skills/strike.json` as the scratch skill
  for steps 1-5 and 7-9 — it's already offensive (`"target":
  "single_enemy"`), has both `cast_vfx` and `impact_vfx` populated, and its
  **current values are the legacy `cast-burst` / `fire-impact` pair**:
  ```json
  "cast_vfx": "cast-burst",
  "impact_vfx": "fire-impact"
  ```
  reoserv hot-reloads pub edits — no restart needed between rounds, just
  save the file and re-cast. **Do not leave `strike.json` in a modified
  state when you're done** — step 9 restores it, and is not optional.

## What's new here, briefly

Four **set pieces** — `bolt`, `smite`, `rockfall`, `ring-of-fire` — sit
alongside the existing 15 generative shape kinds, each authored ×7 elements
(base size only — set pieces have no `-sm`/`-lg` variants, hence 28 new
names, 379 → 407). Three of the four (`bolt`, `smite`, `rockfall`) are
**descents**: something arrives from off-screen and strikes the target, which
needed a taller frame (`TALL_FRAME`: 132×264 output, ground point 3/4 of the
way down, vs. the existing square 132×132 with the ground point centred) to
have room to fall into. `ring-of-fire` is not a descent — it's a sustained
standing ring at the target's feet, using the ordinary square frame, and is
covered separately in step 5.

## Step 1: Each set piece casts at the target, not offset or clipped

Edit `strike.json`, casting each pair below at an NPC in turn and watching
**both** your caster (on cast) and the target (on hit):

```json
"cast_vfx": "bolt-fire",
"impact_vfx": "bolt-water"
```
then
```json
"cast_vfx": "smite-light",
"impact_vfx": "smite-dark"
```
then
```json
"cast_vfx": "rockfall-earth",
"impact_vfx": "rockfall-neutral"
```
then, for a fourth element on at least one of the three (bolt is fine):
```json
"cast_vfx": "bolt-wind",
```

**Expect:** each effect is centred horizontally on the character/target and
its ground contact — the flash, the strike, the landing rocks — sits at
their feet, not floating above their head or cut off at the sprite's base.
The extra headroom (a `TALL_FRAME` def is 264px tall vs. 132px for every
existing effect) extends **upward only**, so the character should not look
shifted, squashed, or clipped at the bottom compared to how the legacy
`cast-burst`/`fire-impact` pair looked in the same spot.

**Failure looks like:** the effect visibly renders above/below/beside the
target instead of centred on their feet; the bottom of the effect (the
ground flash, the point of impact) is cut off or floats off the ground; or
the effect appears clipped at the frame edge (a hard flat cut through the
strike or the rocks) — any of those points at the ground-point/anchor wiring
(`FrameGeometry.anchorY`, `drawEffectAt`'s `cy - outH*anchorY` in
`src/vfx-engine/render.ts`) being wrong for a tall frame, not an art issue.

## Step 2: Descent-vs-damage sync

Skills have **no cast time** — `SkillDef` has cost/cooldown/range/target but
no windup (confirmed by reading `handleSkillDamage` in
`src/handlers/skill.ts`: the damage number (`combatOverlayController
.pushDamage`) and the `impact_vfx` burst (`skillVfxController.playBurst`)
are both fired from the same packet handler, in the same tick, back to
back). That means the descent's landing frame and the HP bar/damage number
popping are supposed to read as **one moment**, not two. This is why
descents are capped at 4 frames × 100ms = 400ms total, not something
longer and smoother.

With `impact_vfx` set to `rockfall-fire` (or `bolt-fire`/`smite-fire`, any
of the three), cast Strike at an NPC several times and watch the target
specifically — the damage number, the HP bar tick, and the rocks/bolt/pillar
landing.

**Expect:** the impact (rocks hitting the ground / bolt striking / pillar
slamming down) lands within a few frames of the damage number appearing —
they should read as the same beat, the way a normal hit's flash-and-number
already does with the existing 15 kinds.

**Failure looks like:** the damage number and HP bar update well before the
descent visibly finishes landing — i.e. you see the number pop, then have to
keep watching for what feels like a separate, later event before the rocks/
bolt/pillar actually connect. That would mean the 400ms budget is wrong (too
slow) and needs to come down further, not that this step passes with a minor
delay you have to squint to notice.

## Step 3: ⚠ THE HEADLINE RISK — does the fall read as a fall, or as a jump-cut?

**This is the honest visual risk of the whole project, and the check that
matters most in this document.** A descent is only 4 frames at 100ms each —
very little runway to sell "something is falling" rather than "something
teleported in, twice." The mitigation authored in from the start is a
**motion streak**: a short tapering wedge trailing upward from each falling
object, drawn only while it's strictly mid-fall (not yet released, not yet
landed) — see `drawRockStreak` in `src/vfx-engine/kinds.ts`, reused
conceptually by bolt's jagged fork rendering and smite's animated trapezoid.

Cast `rockfall-earth` (or any element) at an NPC repeatedly — this is the
kind most exposed to the risk, since it has three independently-scheduled
rocks rather than one continuous shape. Watch closely, frame by frame if you
can (400ms is fast; recast several times, or record and step through).

**Expect:** across the 4 frames, each rock's position visibly progresses
downward with a trailing streak above it implying motion, landing with an
impact puff at the ground. The overall read should be "these rocks are
falling," even if the motion is quick.

**Failure looks like — and this is a REAL, BLOCKING judgment call, not a
formality:** the rocks appear to simply "pop into existence" at different
heights frame to frame with no sense of continuous travel between them — a
jump-cut rather than a fall, streaks or no streaks. If you judge it as a
jump-cut, **do not wave it through**. Record that verdict explicitly. The
two honest remedies, per the plan, are: **(a)** more frames (which
directly reintroduces the Step 2 damage-sync problem — a longer descent
means the impact lands further after the damage number), or **(b)** a real
server-side cast time so the descent can play out before damage resolves
(out of scope for this project — a reoserv + wire change). There is no
third option that fixes this within the current 4-frame/400ms budget; if it
fails, say so and let the follow-up decide between (a) and (b).

## Step 4: Depth — behind the head, in front of the feet

Still on `rockfall-<element>`, cast at an NPC and watch specifically **where
each rock is relative to the character/target sprite** as it falls (both on
your own cast and on the target's impact).

Mechanically: `drawRockfallRocks` splits each rock into `behind` (still
above `cy - 40px`, i.e. "up near the character's head" per the source
comment) or `front` (at or below that line, i.e. "close enough to the
ground to read as in front") — a rock crosses from one layer to the other
between frames as it falls.

**Expect:** while a rock is still high up (early in its fall), it renders
**behind** the character's/target's head and upper body — you should be able
to see the sprite in front of it, at least partially. As the same rock
approaches the ground, it renders **in front of** the character's feet/lower
body, occluding the sprite there instead of being occluded by it.

**Failure looks like:** a rock stays in front of (or behind) the character
for its entire fall with no crossover — i.e. you either always see it
floating in front of the sprite the whole time, or it's hidden behind the
sprite even once it should have landed in front of the feet. Either means
the behind/front split isn't actually happening, or the cutoff height is
wrong.

## Step 5: `ring-of-fire` sustains and repeats, does not expand

Edit `strike.json`:
```json
"cast_vfx": "ring-of-fire-fire",
"impact_vfx": "ring-of-fire-water"
```
Cast Strike at an NPC and watch **both** your own feet and the target for
the full duration — this one is a loop (`loops: 3`), so it runs
4 × 100ms × 3 = 1200ms per cast, three times longer than every other effect
in this pass.

**Expect:** a ring of fire sits at a **fixed size** around the feet the
entire time — it should look like flame tongues flickering/licking upward
off a standing band, with the flicker visibly **repeating three times**
over the 1.2s (not once, and not a single smooth animation) — comparable to
how `spiral-fire`/`chains-dark`/other `loops: 3` kinds in the existing
palette visibly pulse three times, per the prior manual-pass doc's cadence
check.

**Failure looks like:** the ring **grows** outward over the effect's life
(this would mean it's behaving like the existing `ring`/`shockwave` kinds,
which do expand, instead of the deliberately-fixed-radius design —
`RING_OF_FIRE_RX = 38` is a hardcoded constant in the source, never
multiplied by progress); or the flicker plays through what looks like ONE
continuous animation with no visible reset partway through, instead of three
distinct pulses; or the ring is missing/invisible at the target/caster's
feet entirely.

## Step 6: Editor preview matches the game, including the taller canvas (aio-editor)

Open aio-editor, a skill in the form editor (`strike` is fine), and locate
the `cast_vfx` field.

1. Type or pick `bolt-fire` into `cast_vfx`. **Expect:** the preview canvas
   box is visibly **taller** than the box you'd see for an ordinary kind
   like `nova-fire` — 264px tall vs. 132px (both 132px wide) — and the grey
   humanoid stand-in sits **three-quarters of the way down** the box (its
   feet near the bottom quarter), not vertically centred. The bolt's strike
   should land at the stand-in's feet, with the fork extending up into the
   extra headroom above.
2. Compare what you see here against what you saw in-game in Step 1 for the
   same name (`bolt-fire`) — shape, color, and where the strike lands
   relative to the figure should visually match.
3. Switch `cast_vfx` to `nova-fire` (an ordinary square kind). **Expect:**
   the box **shrinks back down** to 132×132 and the stand-in re-centres
   vertically — confirming the box genuinely resizes per-def rather than
   staying stretched.
4. Switch back and forth between `bolt-fire` (or `smite-earth`/
   `rockfall-fire`) and a square kind a couple of times, watching the
   surrounding form fields (whatever is below the `cast_vfx` field in the
   form).

**Expect (and the known, accepted consequence to flag for the human):** when
the box grows to 264px, the form content below the preview visibly gets
**pushed further down the page** — there is no scroll wrapper isolating the
preview's height change from the rest of the form, so a 132px growth/shrink
is a real layout jolt each time you pick a descent vs. a non-descent shape.
This was a deliberate, documented tradeoff (the alternative, scaling the
canvas to a fixed box, would have defeated the engine's whole point of
exact nearest-neighbour pixel output for the one case — a descent — a human
most needs to judge accurately) — **it is not a bug to fix in this pass**,
but the human running this doc should explicitly say whether the layout
jolt is acceptable to ship as-is or worth a follow-up (e.g. a fixed-height
scroll wrapper around just the preview).

**Failure looks like:** the box does NOT grow for `bolt-fire`/`smite-earth`/
`rockfall-fire` (stays 132×132) — meaning the per-def frame sizing isn't
wired into the editor at all; the stand-in stays vertically centred instead
of moving to three-quarters down for a tall def; or the preview for any of
the four set pieces doesn't visually resemble what Step 1 showed in-game
(wrong shape, wrong color, effect not landing at the stand-in's feet). Any
of those blocks — the "known layout consequence" callout above is the ONLY
finding in this step that does not block.

Also confirm `ring-of-fire-fire` in the editor: **expect** the box stays the
ordinary 132×132 (it's a `SQUARE_FRAME` set piece, not a descent) and the
preview visibly repeats its flicker over its longer loop, same as Step 5's
in-game check.

## Step 7: No existing effect changed — spot-check several of the 379

This project claims to be **purely additive**: no existing name changed
name, disappeared, or renders differently. That claim was already checked
exhaustively by machine (see "Byte-identity proof" below) — this step is
the human corroboration, spot-checking a handful by eye rather than trusting
the number.

In the editor (fastest way to flip through many names quickly), type each
of the following into `cast_vfx` and eyeball it against what you remember
(or against the prior rework's manual-pass doc screenshots/tables, if you
have them open) — these span multiple kinds, sizes, and element families so
a regression anywhere in the shared rendering pipeline (not just the new
set-piece code) would likely show up in at least one:
```
nova-fire-lg
ring-water
slash-earth-sm
chains-dark
spiral-light
burst-lines-wind-lg
disc-neutral
crit-flash
buff-aura
heal-glow
```

**Expect:** every one of these looks exactly as it did before this project
— same shape, same color, same size, same timing, square 132×132 frame,
centred ground point. None of them should be taller, shifted, or otherwise
touched by the set-piece work.

**Failure looks like:** any of the above renders differently than you
recall from the prior rework's manual pass (a shift in position, a size
change, a color change, a frame that's suddenly not square) — that would
directly contradict the automated byte-identity proof below and should be
escalated immediately as a serious regression, since it means either this
step or that proof is wrong.

## Step 8: The two sprite sheets still animate unchanged

Edit `strike.json` back to its original values:
```json
"cast_vfx": "cast-burst",
"impact_vfx": "fire-impact"
```
Cast Strike at an NPC.

**Expect:** the curated CC0 sprite-sheet burst plays on cast (an expanding
blue-white ring) and the curated fire flicker plays on impact — identical in
look and timing to every prior rework in this series. These are real PNG
frame-strips (`sheets.ts`/`SHEET_DEFS`), resolved and drawn through a
completely separate code path from `kinds.ts`'s procedural draws, so none of
this project's set-piece/frame-geometry work should be able to touch them.

**Failure looks like:** either sheet effect looks different than before, is
missing, chopped, or shows a "sheet image failed to load" placeholder — any
of those would mean something leaked into the sheet path, which should be
structurally impossible given this project only touched `kinds.ts`,
`registry.ts`, `render.ts`, `types.ts`, and the render-layer anchor plumbing.

## Step 9: ⚠ Carry forward the inherited open question — tint: glow or blob?

A previous project's manual pass (`2026-08-06-eo-idiom-vfx-rework-manual-
pass.md`, Step 4) left an **unresolved, blocking question**: does the
quantised `tint` layer read as an intentional flash/glow on the character,
or as an ugly, flat blob of solid color? `quantizeToRamp` maps every painted
pixel onto one of 4 ramp rungs **at full alpha**, so a low-alpha wash
authored as a soft glow resolves post-quantisation to either a solid rung of
color or nothing — never a gradient. **That question was never answered in
this repo before this project started, and this project does not answer it
either** — it just adds three more places where the same mechanism fires.

`bolt`, `smite`, and `rockfall` all author `tint` layers (confirmed in the
verification table above: `true`/`true`/`true`; `ring-of-fire` has none).
Whatever gets decided for the inherited question applies here too — the
underlying mechanism (`quantizeToRamp`) is identical, not merely similar.

One relevant, independently-verified detail that sharpens the judgment call:
the quantiser is `idx = round(lum × 4) − 1`, so the **hot** rung (the
brightest, idx 3) needs a rendered luminance ≥ 0.875 to survive
quantisation rather than rounding down to `base`. Per-element hot-rung
luminance: `neutral` 1.0, `light` 0.982, `wind` 0.912, and `earth` 0.898 all
clear that bar — but `fire` 0.869, `dark` 0.865, and `water` 0.842 fall just
under it and land on `base` instead, even though the draw code targets the
hot rung explicitly. In practice: a tint flash authored to be "hot" is one
ramp rung dimmer on `fire`, `dark`, and `water` than it is on the other four
elements — worth knowing when you're judging whether a specific element's
flash looks like glow-or-blob, since `fire`/`dark`/`water` are judged against
a different (dimmer) rung than `neutral`/`light`/`wind`/`earth`.

Cast each of the following at an NPC and watch the **character sprite
itself** (not the falling/striking shape) at the moment of impact:
```json
"cast_vfx": "bolt-fire",
```
then
```json
"cast_vfx": "bolt-neutral",
```
then
```json
"cast_vfx": "smite-water",
```
then
```json
"cast_vfx": "rockfall-light",
```

**Expect / judge:** for each — does the flash on the sprite read as an
intentional highlight/glow, or as a flat, ugly patch of solid color sitting
on the character? There is no automated pass condition; this is the same
subjective call the inherited question already flagged as unresolved.

**Failure looks like, and what to do about it:** if any of these reads as an
ugly blob, **do not silently accept it and move on** — record which
element(s) failed, and note explicitly whether your verdict here matches or
differs from whatever was (or wasn't) decided for the inherited `ring`/
`shockwave`/`buff-aura`/`implode-ring-*` cases. Do not treat this project's
tint usage as a separate question from the inherited one — if a fix gets
picked (exempting `tint` from quantisation, or dropping `tint` from affected
kinds), it should cover `bolt`/`smite`/`rockfall` in the same follow-up as
whatever it covers from the earlier rework, not a second one.

## Step 10: Restore

Set `strike.json` back to its original values if you changed anything after
Step 8:
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

## Byte-identity proof (automated, already run — reported here for the record)

The purely-additive claim was checked exhaustively, not sampled: every one
of the 379 pre-existing names was rasterized with the vfx-engine at the
branch point (`7b5f121`) and again at `HEAD`, and the resulting pixel
buffers were compared frame-by-frame, layer-by-layer, byte-for-byte.

```
old (7b5f121) registry size: 379 (expect 379)
new (HEAD) registry size: 407 (expect 407)
sample: ALL 379 pre-existing names (exhaustive, not partial)
missing-in-HEAD count: 0 (expect 0)
Compared 379 defs, 1516 frames (all layers: front/behind/tint).
PASSED: every one of the 379 pre-existing defs, every frame, every layer —
byte-identical pixel buffers between 7b5f121 (branch point) and HEAD.
```

This corroborates Step 7 above: not just "looks the same," but bit-for-bit
identical output for every existing effect, every frame, every layer.

---

## Sign-off

Record in the vault ([[Eoweb]] / VFX planning note, per the user's usual
session wrap-up) whether all of the above matched expectations, and flag
anything that didn't — **especially Step 3 (the fall-vs-jump-cut verdict)
and Step 9 (the tint glow-vs-blob verdict, now covering three more kinds)**,
neither of which has an automated substitute and both of which are
explicitly unresolved as of this pass. This doc doesn't self-certify; a
human needs to watch the canvases and say so.
