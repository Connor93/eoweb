# VFX Set-Piece Tweaks — Manual Verification Pass

> Human/controller pass, not a subagent task — needs a browser, a running
> reoserv dev server, and eyes on two canvases (the game and the editor
> preview). Companion to the automated gates (eoweb `pnpm exec tsc --noEmit`,
> `pnpm exec biome check src/vfx-engine src/render/vfx src/controllers
> scripts`, `pnpm vfx:check`, `pnpm vfx:parity`; aio-editor `npx tsc -p
> tsconfig.json --noEmit`), which already prove the registry is well-formed
> (449 names / 35 shapes / round-trip OK), the vendored copy hasn't drifted,
> and every pre-existing name renders byte-identical pixels to before this
> project (see the proof at the bottom). **None of those gates can tell you
> whether a looped descent reads as a wave or a stutter, whether the editor's
> Cycles control actually does anything, or whether a tint flash looks like a
> glow or a blob** — that is what this pass is for, and **nobody has looked
> at any of this in a browser before this task.**
>
> This project ("VFX set-piece tweaks") sits on top of an earlier "VFX set
> pieces" project that shipped `bolt`/`smite`/`rockfall`/`ring-of-fire` and
> already got its own manual pass
> (`2026-08-06-vfx-set-pieces-manual-pass.md`, sibling to this file). This
> pass does **not** repeat that one — it covers only what the four tasks in
> *this* project changed: an authorable `cycles` axis on the three descents
> (bare name = ×1, `-x2`, `-x3`), an explicit `bodyLift` flag that drops
> `ring-of-fire` onto the floor instead of chest height, an editor Cycles
> control to reach the new axis, reworked ring-of-fire flame art, and
> letting the third rockfall boulder actually land.

## Every name/label below was checked, not picked by eye

Three predecessor VFX projects' manual-pass docs each open with this same
warning, because the very first one shipped a doc whose running example
never existed in the registry. To not repeat that, every effect name and
shape label cited below was verified against a live `buildRegistry()` /
`buildIndex()` / `buildShapes()` call (`pnpm exec tsx
.superpowers/t11-verify-names-t5.ts` from `eoweb/`, a throwaway git-ignored
script — not part of the repo). Output:

```
Total registry size: 449 (expect 449)
Total shapes: 35 (expect 35)

## Names cited in the Task 5 manual-pass doc

| name                 | in registry | in index | frames | loops | frameMs | kind         |
|----------------------|-------------|----------|--------|-------|---------|--------------|
| bolt-fire            | true        | true     | 4      | 1     | 100     | bolt         |
| bolt-fire-x2         | true        | true     | 4      | 2     | 100     | bolt         |
| bolt-fire-x3         | true        | true     | 4      | 3     | 100     | bolt         |
| rockfall-neutral     | true        | true     | 4      | 1     | 100     | rockfall     |
| rockfall-earth       | true        | true     | 4      | 1     | 100     | rockfall     |
| rockfall-fire        | true        | true     | 4      | 1     | 100     | rockfall     |
| rockfall-water       | true        | true     | 4      | 1     | 100     | rockfall     |
| rockfall-wind        | true        | true     | 4      | 1     | 100     | rockfall     |
| rockfall-light       | true        | true     | 4      | 1     | 100     | rockfall     |
| rockfall-dark        | true        | true     | 4      | 1     | 100     | rockfall     |
| ring-of-fire-fire    | true        | true     | 4      | 3     | 100     | ring-of-fire |
| ring-of-fire-water   | true        | true     | 4      | 3     | 100     | ring-of-fire |
| nova-fire-lg         | true        | true     | 4      | 1     | 100     | nova         |
| ring-water           | true        | true     | 4      | 1     | 100     | ring         |
| slash-earth-sm       | true        | true     | 4      | 1     | 100     | slash        |
| chains-dark          | true        | true     | 4      | 3     | 100     | chains       |
| spiral-light         | true        | true     | 4      | 3     | 100     | spiral       |
| burst-lines-wind-lg  | true        | true     | 4      | 1     | 100     | burst-lines  |
| disc-neutral         | true        | true     | 4      | 1     | 100     | disc         |
| crit-flash           | true        | true     | 4      | 1     | 60      | nova         |
| buff-aura            | true        | true     | 4      | 3     | 100     | ring         |
| heal-glow            | true        | true     | 4      | 3     | 100     | disc         |
| bolt-neutral         | true        | true     | 4      | 1     | 100     | bolt         |
| smite-water          | true        | true     | 4      | 1     | 100     | smite        |
| rockfall-light       | true        | true     | 4      | 1     | 100     | rockfall     |
| smite-fire           | true        | true     | 4      | 1     | 100     | smite        |

ALL NAMES CONFIRMED PRESENT

## Absence checks
  bolt-fire-x1: in registry = false (expect false)          # bare name IS ×1
  rockfall-fire-x4: in registry = false (expect false)       # only ×1/×2/×3 exist
  ring-of-fire-fire-x2: in registry = false (expect false)   # no cycles axis on ring-of-fire

## Set-piece shapes (buildShapes(), for the Step 3 Cycles-control check)
  {"id":"setpiece:bolt","label":"Bolt","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":true}
  {"id":"setpiece:smite","label":"Smite","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":true}
  {"id":"setpiece:rockfall","label":"Rockfall","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":true}
  {"id":"setpiece:ring-of-fire","label":"Ring Of Fire","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":false}

## Cycle loop-count check (frames/frameMs must NOT vary — the damage-sync invariant)
  bolt-fire:    frames=4 frameMs=100 loops=1 totalMs=400  firstCycleMs=400
  bolt-fire-x2: frames=4 frameMs=100 loops=2 totalMs=800  firstCycleMs=400
  bolt-fire-x3: frames=4 frameMs=100 loops=3 totalMs=1200 firstCycleMs=400

## Tint layer presence (Step 9)
  bolt: true   smite: true   rockfall: true   ring-of-fire: false
```

`ring-of-fire` deliberately has **no** `tint` layer and **no** `cycles` axis
(`hasCycles: false`) — being sustained over 3 loops is what it *is*, not
something you dial up. The Step 9 tint question applies to `bolt`, `smite`,
and `rockfall` only.

## Prerequisites

- reoserv running against its normal dev config (`cargo run` from
  `/Users/cfraser/Projects/reoserv`), with a character that can reach an NPC
  to hit (needed for every step except Step 3, which is editor-only).
- eoweb dev server running (`pnpm dev` from `/Users/cfraser/Projects/eoweb`),
  logged in with that character.
- aio-editor running both halves (`npm run dev:backend` then `npm run
  dev:frontend` from `/Users/cfraser/Projects/aio-editor`), skills section
  open (needed for Step 3 only).
- The skill pub `reoserv/data/pub/skills/strike.json` as the scratch skill —
  offensive (`"target": "single_enemy"`), `cast_vfx`/`impact_vfx` both
  present. reoserv hot-reloads pub edits — no restart needed between rounds,
  just save the file and re-cast.
- **Before touching `strike.json`, back up its current content** — it is
  already one of three files the user has WIP changes in (not a clean
  baseline you can hardcode), so restoring to some other pass's remembered
  values would clobber real work:
  ```
  cp /Users/cfraser/Projects/reoserv/data/pub/skills/strike.json /tmp/strike-baseline.json
  ```
  At the time this doc was written, that baseline was `cast_vfx: ""`,
  `impact_vfx: "smite-light"` — expect something close to that, not
  necessarily identical if the user has since edited it further. Step 10
  restores from `/tmp/strike-baseline.json`, not from the values printed
  here.

## What's new here, briefly

Four small changes, each landed as its own task: **(T1)** `bodyLift` is now
an explicit flag on a frame's geometry instead of guessed from `anchorY ===
0.5` — `ring-of-fire` gets its own `GROUND_FRAME` (bodyLift `false`) so it no
longer inherits the 20px lift meant for the 379 body-centred legacy blobs.
**(T2)** the three descents (`bolt`/`smite`/`rockfall`) gained a `cycles`
axis — bare name plays once, `-x2`/`-x3` repeat the same 4-frame/400ms
texture set 2 or 3 times, **never** changing `frames` or `frameMs`, so the
first cycle is still exactly 400ms (the damage-sync guarantee). **(T3)** the
aio-editor's `cast_vfx`/`impact_vfx` field grew a Cycles control (1×/2×/3×)
that replaces the Size control for shapes that have cycles instead of sizes
— no shape has both. **(T4)** `ring-of-fire`'s flame tongues were reworked
(fixed a real pre-existing bug where their "independent" flicker was
mathematically collapsed into a ~16° phase band) and gained a ground-level
centre fill. **(T5, this task)** the third rockfall boulder, previously
pinned airborne forever by a since-corrected assumption, now lands on the
last frame like the other two.

---

## Step 1: `bolt-fire-x2`/`-x3` visibly repeat, and the first impact still syncs with the damage number

Edit `strike.json`:
```json
"cast_vfx": "",
"impact_vfx": "bolt-fire-x2"
```
Cast Strike at an NPC several times, watching the target. Then switch to
`"bolt-fire-x3"` and repeat.

**Expect:** the bolt strike visibly plays through its full flash-and-fork
animation, then plays it again from the top (twice for `-x2`, three times
for `-x3`) rather than showing only one cycle. Despite the repeats, the
damage number and HP bar tick still land at essentially the same moment as
the **first** cycle's strike — `frames`/`frameMs` are unchanged at 4/100ms
regardless of the cycle suffix (confirmed in the verification table above:
`firstCycleMs=400` for all three), and `pushDamage`/`playBurst` still fire
together from the same packet handler with no cast time, exactly as they did
for the un-cycled effect. The extra cycles are purely visual follow-through
after the hit already registered.

**Failure looks like:** the effect only plays once regardless of the `-x2`/
`-x3` suffix (the cycles axis isn't actually reaching playback); or the
damage number now visibly lags behind the *first* strike (would mean the
400ms first-cycle budget got broken — check that `frames`/`frameMs` truly
didn't change, per the table above).

## Step 2: ⚠ BLOCKING — does a looped descent read as successive waves, or as a stutter?

**This is the one thing in this whole project that genuinely could not be
predicted, and the check that matters most in this document.** A descent
plays, its object lands, and then — for `-x2`/`-x3` — the *same* object
resets to its starting position and falls again. Done well this reads as
"another wave arrives." Done badly it reads as "that just glitched
backward."

Edit `strike.json`:
```json
"cast_vfx": "",
"impact_vfx": "rockfall-earth-x3"
```
Cast Strike at an NPC repeatedly. Watch the target closely across the full
1200ms (4 frames × 100ms × 3 loops) — this is the sharpest version of the
risk in the whole project, because rockfall's rocks travel much further
(up to 150px) and more visibly than bolt's flash or smite's pillar, so if a
reset-to-top is going to look like a hitch anywhere, it's here. Specifically
watch **rock 2** (previously the one T5 fixes) — it now stays parked near
the top through frame 0-1 of *each* cycle, then falls and lands on the last
frame of that cycle, at which point it snaps back to the top for the next
cycle's frame 0.

**Expect:** each cycle reads as a fresh volley of rocks crashing down — the
snap-back-to-top between cycles is fast enough (one 100ms frame boundary)
that it doesn't register as its own event; your eye follows the *falling*
motion each cycle, not the reset.

**Failure looks like — and this is a REAL, BLOCKING judgment call, not a
formality:** the moment a rock lands and reappears at the top for the next
cycle reads as a visible hitch or rewind — like the animation skipped
backward rather than a new rock arriving. **If you judge it as a stutter, do
not wave it through.** Record the verdict explicitly. Per the design
discussion, the honest remedies are a fade/gap between cycles or dropping
the cycles axis for `rockfall` specifically (both are follow-up design work,
not a tweak to make here) — there is no fix available inside this pass.
Time permitting, spot-check `bolt-fire-x3` and `smite-light-x3` too (same
mechanism, smaller/faster shapes — worth knowing if the risk is
rockfall-specific or general), but the rockfall verdict is the one that
blocks.

## Step 3: ⚠ The editor's Cycles control actually exists and changes the composed name

This needs its own explicit check because of a real trap: `composeVfxName`
takes `cycles` as a **trailing optional parameter**
(`composeVfxName(shapeId, element?, size?, cycles?)` in
`src/vfx-engine/registry.ts`). That means if the editor wiring had been
skipped entirely, **nothing would have failed to compile** — the existing
3-argument call site is still legal TypeScript. The picker would just
silently stay at the implicit ×1 default forever, with no error anywhere to
catch it. `tsc` cannot tell you this control exists; only looking at it can.

In aio-editor, open `strike` (or any skill) in the form editor and find the
`cast_vfx` field:

1. Pick shape **Rockfall**, any element. **Expect:** the row of buttons next
   to the element dots reads **1× / 2× / 3×** (not S / M / L) — set pieces
   have no size axis, so this is the Cycles control, not a mislabeled Size
   control.
2. Click **›** (top-right of the field) to switch to the raw-text view.
   **Expect:** the input shows the literal string `rockfall-<element>` with
   no suffix (×1 is the bare name).
3. Click **‹** to go back to pickers, click **2×**, then click **›** again.
   **Expect:** the raw text now reads `rockfall-<element>-x2`.
4. Repeat for **3×**. **Expect:** `rockfall-<element>-x3`.
5. Switch shape to **Bolt** or **Smite** and confirm the same 1×/2×/3×
   control appears and works the same way.
6. Switch shape to an ordinary matrix kind, e.g. **Nova**. **Expect:** the
   control reverts to **S / M / L** (Size), not Cycles — no shape has both.

**Failure looks like:** the control next to the element dots shows S/M/L
(greyed out) for Rockfall/Bolt/Smite instead of 1×/2×/3× — meaning the
Cycles control was never wired in and the shape is silently stuck on Size
(which does nothing for a set piece, since `composeVfxName` ignores `size`
for set pieces). Or: the buttons render and appear clickable, but the raw
text never changes when you click 2×/3× — meaning `pickCycles`/`emit` isn't
actually calling `composeVfxName` with the new value. Either is the exact
silent-incompleteness failure this step exists to catch — there will be no
compiler error to point at.

## Step 4: `ring-of-fire` now sits ON THE GROUND, not at chest height

Edit `strike.json`:
```json
"cast_vfx": "ring-of-fire-fire",
"impact_vfx": "ring-of-fire-water"
```
Cast Strike at an NPC and watch **both** your own feet (on cast) and the
target (on hit).

**Expect:** the ring of flame sits at ground level, encircling the
character's/target's **feet** — the standing band and its flame tongues
should read as something the character is standing *in*, not floating
around their torso/chest. This is the direct, visible result of T1's
`bodyLift` fix: `ring-of-fire` moved from `SQUARE_FRAME` (bodyLift `true`,
which is what put it at chest height before this project) to its own
`GROUND_FRAME` (bodyLift `false`).

**Failure looks like:** the ring still floats around the character's
midsection/chest instead of the feet — this would mean `bodyLift` regressed
back to `true` for `GROUND_FRAME`, or `SkillVfxController.playBurst` is
still applying the 20px lift regardless of the flag.

## Step 5: The flames flicker independently, not in unison

Still on `ring-of-fire-fire`/`ring-of-fire-water`, cast repeatedly and watch
the **10 individual flame tongues** around the ring closely — recast a few
times if 400ms-per-flash is too fast to track by eye the first time.

**Expect:** the tongues rise and fall at visibly different times from each
other — some tall while neighbors are short, not all pulsing up and down
together. This is a **real bug fix**, not just new art: the previous phase
formula aliased against its own internal constant (5 × 2.399 ≈ 12, an
integer), collapsing all 10 tongues' phases into a ~16° band despite looking
independent in the source code. The fix (a brute-forced multiplier) spreads
them to a ~32° minimum pairwise separation — close to the ~36° a perfectly
even 10-way split would give.

**Failure looks like:** the tongues still rise and fall together as one
pulsing mass rather than as ten independent flames — this is the exact
"pattern, not fire" complaint the fix targeted, and would mean the phase
aliasing wasn't actually broken (check `RING_OF_FIRE_TONGUE_PHASE_MULT` in
`src/vfx-engine/kinds.ts` — it should be `18`, not `5`).

## Step 6: The centre fill sits UNDER the NPC, and the ring loops without a visible seam

Same cast as Steps 4-5, but now watch four different things over the ring's
full **1200ms** duration (4 frames × 100ms × 3 loops — three times longer
than a plain descent):

1. **Depth:** the warm glow filling the inside of the ring should render
   **behind** the character/target sprite — i.e. the character's own sprite
   should occlude the glow where they're standing, not the other way
   around. (Mechanically: `drawRingOfFireCentreFill` only ever draws in the
   `behind` layer, never `front`.)
2. **Loop seam:** watch the flicker (tongues + centre fill together) across
   all three loop repeats. Because this is a `loops: 3` effect, you'll see
   the wrap from end-of-cycle back to start-of-cycle **three times** over
   the full cast.
3. **Glow, or blob? (the centre fill itself — judge THIS IN GAME, not the
   editor.)** Step 9 below carries the inherited tint glow-vs-blob question
   forward for `bolt`/`smite`/`rockfall`, but explicitly excludes
   `ring-of-fire` because it has no `tint` layer — nobody is otherwise asked
   to judge the new centre fill the same way. It deserves the same scrutiny:
   `drawRingOfFireCentreFill` authors alpha as `0.6 ± 0.15` (a continuous
   swing), but `quantizeToRamp` collapses that onto a small number of
   discrete ramp rungs, so post-quantisation the swing becomes a rung *flip*
   — measured: mid↔shadow for `fire`/`water`/`earth`, base↔mid for
   `neutral`, and flat (no flip, steady on one rung) for `wind`/`light`/
   `dark`. Watch each element (recast with `ring-of-fire-<element>` for the
   ones not already in your rotation) and judge whether the flicker reads as
   a believable pulsing glow or as a patch of color visibly snapping between
   two flat shades. **This must be judged in the game, even after Fix 1** —
   the editor's `behind`/`front` compositing previously always used
   `source-over` regardless of the def's `additive` flag (now fixed, see
   Fix 1), but the editor is still a Canvas2D approximation of a Pixi
   renderer; treat in-game as the ground truth for this call the same way
   Step 9 already treats it as the ground truth for tint.
4. **Front-layer occlusion.** This project widened
   `RING_OF_FIRE_TONGUE_BASE_H` 9→12 and `RING_OF_FIRE_TONGUE_AMP` 8→24. The
   *near* tongues (the half of the ring drawn in `front`, over the
   character's legs/feet) now rise 17–34 design px above the ground point at
   full flicker, up from 8–14 before — and the front layer's total painted
   area grew roughly 60–95%. In plain terms: flames that used to lick the
   character's shins now reach roughly waist height on the near side. This
   is in budget (nothing is clipped or overflowing its frame) and was a
   deliberate part of this project's art rework, not a bug — but nobody has
   judged by eye whether it now obscures too much of the character/target
   standing in it. Watch the near-side tongues specifically and decide.

**Expect:** the centre glow is visibly tucked behind the character's sprite,
not painted over it. The flicker pulses smoothly through all three
repeats — no visible jump, flash, or reset at the two seam points (the
transition from cycle 1→2 and 2→3). For items 3 and 4 there is no automated
pass condition — record your verdict explicitly, the same way Step 2 and
Step 9 require.

**Failure looks like:** for items 1-2 — the glow renders in front of / on
top of the character instead of behind (would mean it leaked into the
`front` layer), or you can see a distinct "pop"/discontinuity at the loop
boundary (would contradict the analytic proof that a 4-evenly-spaced-sample
sine wrap has the same magnitude as any interior step). For item 3 — the
fill reads as an ugly flat patch of color snapping between shades rather
than a believable pulse; record which element(s) failed, same as Step 9's
tint failure protocol. For item 4 — the near-side flames obscure so much of
the character/target that the effect reads as visually excessive; if so,
flag it as follow-up design work (this pass has no fix available for
`TONGUE_BASE_H`/`AMP`, which are explicitly out of scope for this branch).

## Step 7: All three boulders land

Edit `strike.json`:
```json
"cast_vfx": "",
"impact_vfx": "rockfall-earth"
```
(bare name, ×1 — no cycles suffix this time). Cast Strike at an NPC
repeatedly and watch the target's feet across all 4 frames.

**Expect:** by the last frame, **all three rocks** have visibly reached the
ground — none should still be visibly falling or hanging in mid-air when
the effect ends. Per the automated landing-schedule proof below, rock 0
lands early (frame 1), rock 1 lands in the middle (frame 2), and rock 2 —
previously pinned airborne forever — now lands exactly on the last frame
(frame 3), alongside its own impact puff.

**Failure looks like:** one of the three rocks (almost certainly rock 2, the
one this task changed) is still visibly airborne or mid-fall on the final
frame instead of landed — would mean `ROCKFALL_LAND_PROGRESS[2]` regressed
back toward its old out-of-range value, or `ROCKFALL_FALL_DURATION[2]` is
wrong.

## Step 8: ⚠ No existing effect moved — spot-check several, and both sprite sheets

`bodyLift` is the one change in this whole project that fails **silently**
— it repositions things rather than breaking a build, and a mistake here
could shift all 379 legacy effects (plus the two curated sprite sheets) by
20px. The automated proof below checked this exhaustively (byte-for-byte,
not by eye); this step is the human corroboration.

**Ordinary effects — check THIS IN GAME, not the editor.** `bodyLift` has no
consumer in aio-editor: `VfxPreview`'s stand-in is planted at
`outH * anchorY` with no lift applied, for every effect, lifted or not — so
all ten names below render **pixel-identically in the editor** whether
`SQUARE_FRAME.bodyLift` is `true` or `false`. Checking them there would
prove nothing; it's the one change in this whole project that fails
silently, and the editor cannot corroborate it at all. Use the editor only
to browse/confirm the names exist (they were verified against the current
registry, see the table at the top) — do the actual judgment in-game:

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

Edit `strike.json`'s `cast_vfx` to each name in turn (one at a time — leave
`impact_vfx` alone), save, and cast Strike so it fires on your own
character. Time permitting, spot-check all ten; if short on time, a couple
(e.g. `nova-fire-lg` and `buff-aura`) are enough to catch a global
regression, since `bodyLift` is a single shared flag on `SQUARE_FRAME`, not
a per-effect setting. Watch where each effect centres **relative to your
character**, specifically for a ~20px shift.

**Expect:** every one renders exactly as it did before this project — same
shape, color, size, timing, square 132×132 frame, centred at roughly
**chest height** on the character (the lift these 379 legacy effects have
always had — these are NOT `ring-of-fire`, they should **not** have moved
to the ground). Correcting a claim in an earlier draft of this doc: the
editor's "centred ground point" is at the stand-in's **feet**, not chest
height, for every effect it previews — the chest-height look is produced
entirely in-game by the very `bodyLift` this task added, which the editor
never applies. That is why this check has to happen in-game.

**Both sprite sheets.** Restore `strike.json` to the curated sheet pair
temporarily:
```json
"cast_vfx": "cast-burst",
"impact_vfx": "fire-impact"
```
Cast Strike at an NPC. **Expect:** the expanding blue-white ring plays on
cast and the fire flicker plays on impact, identical in look, position, and
timing to every prior rework in this series — these are real PNG
frame-strips resolved through a completely separate code path from
`kinds.ts`'s procedural draws (`sheets.ts`/`SHEET_DEFS`), so nothing in this
project should be able to touch them, but "should be able to" is exactly
what T1's silent-failure risk is about.

**Failure looks like:** any of the ten spot-checked effects visibly drops to
ground level instead of sitting at chest height — a ~20px downward shift is
the specific signature of a `bodyLift` regression (`SQUARE_FRAME.bodyLift`
reverting to `false`, or `SkillVfxController.playBurst` no longer applying
the lift). More generally, anything shifted, resized, or otherwise
different than you recall for either the ten effects or the two sprite
sheets would directly contradict the automated byte-identity proof below and
should be escalated immediately, since it means either this step or that
proof is wrong.

## Step 9: Carry forward the still-unresolved tint question — glow, or blob?

A previous project's manual pass left this **unresolved and blocking**: does
the quantised `tint` layer read as an intentional flash/glow on the
character, or as a flat, ugly patch of solid color? `quantizeToRamp` maps
every painted pixel onto one of 4 ramp rungs at full alpha, so a low-alpha
wash authored as a soft glow resolves, post-quantisation, to either a solid
rung of color or nothing — never a gradient. **This project does not answer
that question either** — `bolt`, `smite`, and `rockfall` all still author
`tint` layers (confirmed in the table above: `true`/`true`/`true`;
`ring-of-fire` has none). `ring-of-fire` is not exempt from this style of
judgment call, though — it has its own equivalent in its centre fill's
alpha swing, which quantises the same way; that's Step 6 item 3 above, not
here, since it's a `behind`-layer fill rather than a `tint` layer.

Cast each of the following at an NPC and watch **your own character
sprite** (these set `cast_vfx`, which fires on the caster, not the target):
```json
"cast_vfx": "bolt-fire",
```
then `"bolt-neutral"`, then `"smite-water"`, then `"rockfall-light"`.

**New wrinkle from this project, worth flagging while you're here:** the
cycles axis makes the tint flash **repeat once per loop** — a `-x2`/`-x3`
descent replays the same 4 textures, tint included (confirmed in
`skill-burst.ts`: `stepIndex % layer.frames.length` reuses the same frame
set every cycle). So `"bolt-fire-x3"` will flash the tint **three times**
over its 1200ms instead of once. If you have time, cast that too and note
whether a repeating flash reads differently (better or worse) than the
inherited single-flash question — this compounding is new to this project
and wasn't something the earlier pass could have judged.

**Expect / judge:** for each — does the flash read as an intentional
highlight/glow, or as an ugly flat patch of solid color? There is no
automated pass condition; this is the same subjective call the inherited
question already flagged as unresolved.

**Failure looks like, and what to do about it:** if any reads as an ugly
blob, **do not silently accept it and move on** — record which element(s)
failed, and note whether your verdict matches or differs from whatever was
(or wasn't) decided for the earlier `ring`/`shockwave`/`buff-aura` cases.
Treat this project's tint usage as the SAME open question, not a new one —
a fix (exempting `tint` from quantisation, or dropping it from affected
kinds) should cover `bolt`/`smite`/`rockfall` in the same follow-up as
whatever it covers from the earlier rework.

## Step 10: Restore

Restore `strike.json` from the backup you made in Prerequisites:
```
cp /tmp/strike-baseline.json /Users/cfraser/Projects/reoserv/data/pub/skills/strike.json
```
Then from a terminal:
```
diff /tmp/strike-baseline.json /Users/cfraser/Projects/reoserv/data/pub/skills/strike.json
git -C /Users/cfraser/Projects/reoserv status --short
```

**Expect:** the `diff` prints nothing (files identical), and `git status
--short` shows exactly the three pre-existing WIP lines that were already
there before this pass —
```
 M data/pub/npcs/0007.json
 M data/pub/skills/rage.json
 M data/pub/skills/strike.json
```
— with `strike.json`'s diff being whatever it already was before you
started (not `""`/`"smite-light"` specifically, if the user has since
changed it further — the `diff` command above is the real check, not the
literal values printed in Prerequisites).

**Failure looks like:** the `diff` shows any difference, or `git status
--short` lists a fourth file. If so, restore `strike.json` from
`/tmp/strike-baseline.json` again and re-check before considering this pass
done.

---

## Automated proofs (already run — reported here for the record)

### Rockfall landing schedule (analytic + ground-truth pixel check)

`.superpowers/t9-rockfall-landing.ts` — extracts `ROCKFALL_TOP_OFFSET` /
`ROCKFALL_LAND_PROGRESS` / `ROCKFALL_FALL_DURATION` live from
`src/vfx-engine/kinds.ts` (not retyped), evaluates the same formula
`rockFallOffset` uses, and separately renders every frame through the real
`renderFrameCanvas` pipeline to count painted pixels per layer:

```
| rock | frame0 (p=0.125) | frame1 (p=0.375) | frame2 (p=0.625) | frame3 (p=0.875) | layers |
|---|---|---|---|---|---|
| 0 | 35.00 | 0.00 | 0.00 | 0.00 | F -> F -> F -> F |
| 1 | 150.00 | 75.00 | 0.00 | 0.00 | B -> B -> F -> F |
| 2 | 150.00 | 150.00 | 75.00 | 0.00 | B -> B -> B -> F |

RESULT: all three rocks reach offset 0 (landed) within the sampled range

RESULT: front is non-empty on every frame, every element
RESULT: behind is non-empty on frames 0-2, every element
RESULT: behind is (correctly) EMPTY on frame 3, every element — all three rocks have landed
```

Confirms: all three rocks reach the ground; `front` never comes up empty;
`behind` is populated on frames 0-2 and is **correctly** empty on frame 3
(nothing is left behind the character once every rock has landed — see the
rewritten module comment in `kinds.ts` for why that's intended, not a bug).

### Byte-identity: no pre-existing effect changed

The purely-additive claim was checked exhaustively, not sampled, using a
detached git worktree at the branch point:

```
OLD (448c4d2) full registry size: 407 (379 legacy + 28 set-piece base names)
OLD (448c4d2) LEGACY-only names (kind not in {bolt,smite,rockfall,ring-of-fire}): 379
NEW (working tree) registry size: 449
missing-in-NEW count: 0

sample: ALL 379 of the 379 pre-existing (legacy, non-set-piece) names (exhaustive, not partial)
Compared 379 defs, 4548 (frame,layer) slots.
PASSED: every one of the 379 pre-existing legacy defs, every frame, every
layer — byte-identical pixel buffers between 448c4d2 (branch point) and the
current working tree (this task's HEAD-to-be).
```

Note the branch point (`448c4d2`) already carries 407 names, not 379: the 4
set-piece kinds were added by the *prior* "VFX set pieces" project and are
exactly what this project's T1/T4/T5 are entitled to keep changing. "379
pre-existing" filters those out — every name whose `kind` is one of
`bolt`/`smite`/`rockfall`/`ring-of-fire` is deliberately excluded from this
claim, since this project changes them on purpose. This corroborates Step 8
above with bit-for-bit pixel comparison, not just "looks the same."

### Gate sweep

- eoweb `pnpm exec tsc --noEmit` → clean, no output.
- eoweb `pnpm exec biome check src/vfx-engine src/render/vfx src/controllers
  scripts` → `Checked 67 files ... Found 1 warning` (exit 0) — the one
  warning is a pre-existing `useOptionalChain` suggestion in
  `src/controllers/skill-controller.ts` from a prior commit (`989d2f3`),
  untouched by this task.
- eoweb `pnpm vfx:check` → `vfx-index: 449 names, 35 shapes, round-trip OK`.
- eoweb `pnpm vfx:parity` → `vfx-engine parity: OK (10 file(s) match)`;
  `vfx-registry-parity: 449 effects, eoweb registry keys === aio-editor
  registry keys` (after `bash scripts/sync-vfx-engine.sh`).
- aio-editor `cd packages/frontend && npx tsc -p tsconfig.json --noEmit` →
  exit 0.
- `git -C /Users/cfraser/Projects/reoserv status --short` → exactly
  `data/pub/npcs/0007.json`, `data/pub/skills/rage.json`,
  `data/pub/skills/strike.json`. reoserv untouched by this task.

---

## Sign-off

Record in the vault ([[Eoweb]] / VFX planning note, per the user's usual
session wrap-up) whether all of the above matched expectations, and flag
anything that didn't — **especially Step 2 (the wave-vs-stutter verdict for
looped rockfall), Step 6 items 3-4 (the centre fill's glow-vs-blob verdict,
and whether the widened front-layer tongues now obscure too much), and
Step 9 (the tint glow-vs-blob verdict, now also covering the once-per-loop
repeat)** — none of which has an automated substitute and all of which are
explicitly unresolved as of this pass. This doc doesn't self-certify; a
human needs to watch the canvases and say so.
