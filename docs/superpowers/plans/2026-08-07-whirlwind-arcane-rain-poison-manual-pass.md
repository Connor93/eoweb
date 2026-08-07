# Whirlwind, Arcane Rain, Poison — Manual Verification Pass

> Human/controller pass, not a subagent task — needs a browser (aio-editor),
> a running reoserv dev server + eoweb dev client, and eyes on two canvases.
> Companion to the automated gates already run for this project: `npm run
> vfx:check` (526 effects, 40 shapes, round-trip OK, 24 kinds with `front`
> present for all), `npm run vfx:parity` (10 files match, eoweb/aio-editor
> registry keys identical), `cd aio-editor && npm run typecheck` (clean
> across both workspaces), and `npm run build` in both repos (both
> succeeded). **None of those gates can tell you whether a funnel reads as
> enclosing its target or as a decal, whether a barrage reads as staggered
> or as a curtain, or whether a stack of popping bubbles reads as one event
> or a mess** — that is what this pass is for, and nobody has looked at any
> of it in a browser before this task.

## Every name/label below was checked, not picked by eye

Prior VFX projects' manual-pass docs each open with this warning, because
the very first one in this series shipped a doc whose running example
never existed. Every name and shape label cited below was verified against
a live `buildRegistry()` / `buildIndex()` / `buildShapes()` call, run from
`eoweb/` via a throwaway, git-ignored `tsx` script (not part of the repo,
already deleted). Output:

```
Total registry entries: 526 (expect 526)
Total shapes: 40

## Shape picker entries for the three new set pieces

Whirlwind: FOUND id=setpiece:whirlwind hasElement=true hasSize=false hasCycles=false
Arcane Rain: FOUND id=setpiece:arcane-rain hasElement=true hasSize=false hasCycles=true
Poison: FOUND id=setpiece:poison hasElement=true hasSize=false hasCycles=false

## Names cited in the manual-pass doc

OK   whirlwind-neutral  frames=4 loops=3 frameMs=100 totalMs=1200
OK   whirlwind-fire     frames=4 loops=3 frameMs=100 totalMs=1200
OK   whirlwind-water    frames=4 loops=3 frameMs=100 totalMs=1200
OK   whirlwind-earth    frames=4 loops=3 frameMs=100 totalMs=1200
OK   whirlwind-wind     frames=4 loops=3 frameMs=100 totalMs=1200
OK   whirlwind-light    frames=4 loops=3 frameMs=100 totalMs=1200
OK   whirlwind-dark     frames=4 loops=3 frameMs=100 totalMs=1200
OK   arcane-rain-neutral     frames=4 loops=1 frameMs=100 totalMs=400
OK   arcane-rain-fire        frames=4 loops=1 frameMs=100 totalMs=400
OK   arcane-rain-water       frames=4 loops=1 frameMs=100 totalMs=400
OK   arcane-rain-earth       frames=4 loops=1 frameMs=100 totalMs=400
OK   arcane-rain-wind        frames=4 loops=1 frameMs=100 totalMs=400
OK   arcane-rain-light       frames=4 loops=1 frameMs=100 totalMs=400
OK   arcane-rain-dark        frames=4 loops=1 frameMs=100 totalMs=400
OK   arcane-rain-neutral-x2  frames=4 loops=2 frameMs=100 totalMs=800
OK   arcane-rain-fire-x2     frames=4 loops=2 frameMs=100 totalMs=800
OK   arcane-rain-water-x2    frames=4 loops=2 frameMs=100 totalMs=800
OK   arcane-rain-earth-x2    frames=4 loops=2 frameMs=100 totalMs=800
OK   arcane-rain-wind-x2     frames=4 loops=2 frameMs=100 totalMs=800
OK   arcane-rain-light-x2    frames=4 loops=2 frameMs=100 totalMs=800
OK   arcane-rain-dark-x2     frames=4 loops=2 frameMs=100 totalMs=800
OK   poison-neutral  frames=4 loops=1 frameMs=100 totalMs=400
OK   poison-fire     frames=4 loops=1 frameMs=100 totalMs=400
OK   poison-water    frames=4 loops=1 frameMs=100 totalMs=400
OK   poison-earth    frames=4 loops=1 frameMs=100 totalMs=400
OK   poison-wind     frames=4 loops=1 frameMs=100 totalMs=400
OK   poison-light    frames=4 loops=1 frameMs=100 totalMs=400
OK   poison-dark     frames=4 loops=1 frameMs=100 totalMs=400
MISS fire-impact  (expected — see below)
OK   smite-dark-x2       frames=4 loops=2 frameMs=100 totalMs=800
OK   ring-of-fire-fire   frames=4 loops=3 frameMs=100 totalMs=1200
OK   cleave-dark-x2      frames=8 loops=1 frameMs=100 totalMs=800
OK   swordfall-dark      frames=4 loops=1 frameMs=100 totalMs=400

ALL NAMES VERIFIED (33/34 real registry names OK; the one "MISS" is `fire-impact`,
a curated sprite-sheet resolved via SHEET_DEFS/vfx-manifest.ts's SHEETS table,
OUTSIDE buildRegistry() by design — confirmed present in sheets.ts. Same
pattern documented in this series' Task-8 predecessor script.)
```

## Prerequisites

- reoserv running against its normal dev config (`cargo run` from
  `/Users/cfraser/Projects/reoserv`), with a character that can reach an NPC
  to hit (needed for steps 3, 4, 8, 9, 10; not needed for steps 1, 2, 5, 6, 7).
  **Note:** the reoserv tree currently carries unrelated pre-existing WIP on
  several pub files (`git status --short` shows modified/untracked files
  beyond this project's scope) — leave those alone; this pass touches only
  `data/pub/skills/strike.json`, and only temporarily (see steps 8/10 below).
- eoweb dev server running (`npm run dev` from `/Users/cfraser/Projects/eoweb`),
  logged in with that character.
- aio-editor running both halves (`npm run dev:backend` then `npm run
  dev:frontend` from `/Users/cfraser/Projects/aio-editor`), a skill open in
  the form editor (steps 1, 2, 5, 6, 7 — reoserv/eoweb not needed for these).
- The skill pub `reoserv/data/pub/skills/strike.json` as the scratch skill
  for steps 8-10 — it targets a single enemy and already has both `cast_vfx`
  and `impact_vfx` populated. **Before editing it, note its current
  `cast_vfx`/`impact_vfx` values** (`cat data/pub/skills/strike.json`) so you
  can restore exactly those in step 10 — do not assume a specific baseline,
  since this file may have moved since this doc was written. reoserv
  hot-reloads pub edits, no restart needed between rounds.

## What's new here, briefly

Three new **set pieces** — `whirlwind`, `arcane-rain`, `poison` — join the
six existing ones (`bolt`, `smite`, `rockfall`, `ring-of-fire`, `cleave`,
`swordfall`), taking the catalog 491 → 526 names, 37 → 40 shapes, 21 → 24
`ShapeKind`s. All three are element-parameterised (7 elements), size-less
(no `-sm`/`-lg`).

- **`whirlwind`** — `TALL_FRAME` (128×256, ground point 3/4 down). The first
  **sustained tall-frame** effect: `frames: 4, loops: 3, frameMs: 100` =
  **1200ms**, no cycles axis (a one-cycle tornado isn't a thing anyone
  wants — same reasoning as `ring-of-fire`). Its `behind`/`front` split
  draws the funnel's far wall behind the target and its near wall (plus
  orbiting debris) in front — that split is the entire reason it's a set
  piece rather than a matrix kind.
- **`arcane-rain`** — `TALL_FRAME`, a descent like `smite`/`rockfall`: 7
  motes fall from off-frame, staggered (not in unison), and pop on contact.
  Carries the **cycles axis** (`-x2`/`-x3`, `cycleMode: 'loop'`) — repeated
  waves, each identical to the last.
- **`poison`** — `SQUARE_FRAME`, body-centred (so it lands on the NPC, not
  at its feet). 5 bubbles rise out of a low haze and pop. Deliberately the
  smallest: 400ms, no cycles — it's meant to fire on every DoT tick, and the
  authored `poison` status ticks at 1000ms, so it must clear well before the
  next tick.

## Step 1: Editor — shape picker exposes the right controls

Open aio-editor, a skill in the form editor, and open the `cast_vfx` shape
dropdown.

**Expect:**
- The dropdown lists `Whirlwind`, `Arcane Rain`, and `Poison` (alongside the
  existing 37 shapes).
- Selecting any of the three shows the row of 7 element colour chips
  (neutral/fire/water/earth/wind/light/dark), all clickable.
- For **Whirlwind** and **Poison**, the size slot to the right of the
  element chips shows the S/M/L buttons **greyed out and unclickable**
  (these shapes have no size axis).
- For **Arcane Rain only**, that same slot instead shows **`1×` / `2×` /
  `3×` Cycles buttons**, clickable.

**Failure looks like:** any of the three names missing from the dropdown;
element chips disabled/greyed for any of them; the S/M/L size buttons
enabled (clickable) for any of the three (none should have a size axis);
or Cycles buttons (`1×`/`2×`/`3×`) appearing for Whirlwind or Poison, or
NOT appearing for Arcane Rain.

## Step 2: Editor — `whirlwind` reads as a tornado, at every element

Pick `Whirlwind`, then click through all 7 element chips
(`whirlwind-neutral` through `whirlwind-dark`) and watch the preview loop.

**Expect:** a funnel narrow at the ground, widening as it rises, with
visible horizontal **sway** (the bands drift side to side as it spins) —
debris motes visibly orbiting partway up. The shape should read the same
way at every element; only the colour changes.

**Failure looks like:** the funnel looks flat/static with no sway; it
doesn't visibly widen from base to top; debris motes are missing or don't
appear to orbit; or any element renders a differently-shaped funnel than
the others (colour should be the only thing that varies).

## Step 3: Game — ⚠ BLOCKING: does `whirlwind` enclose the target?

**This is the entire reason `whirlwind` is a set piece and not a matrix
kind, and the check that matters most in this document.** The funnel draws
its far wall on `behind` (under the target sprite) and its near wall plus
orbiting debris on `front` (over it) — the intent is that the target
visually stands *inside* the tornado, not that a tornado shape is pasted on
top of it.

Set `strike.json`'s `impact_vfx` to `whirlwind-wind` (or `cast_vfx`, to see
it on your own character — either shows the same funnel) and cast at an NPC.

**Expect:** the funnel's far side renders behind the NPC (you can see the
NPC's upper body/head in front of that wall) while its near side renders in
front of the NPC's lower body — the NPC should read as **standing inside**
a hollow tube, not standing behind a flat sticker.

**Failure looks like — a REAL, BLOCKING judgment call, not a formality:**
the funnel reads as a flat decal sitting on top of (or entirely behind) the
NPC with no sense of the NPC being enclosed — i.e. the near/far split isn't
producing a visible "inside the tube" effect. If you judge it as a decal,
**do not wave it through** — record that verdict explicitly; it's the
headline risk of this whole project.

## Step 4: Game — ⚠ BLOCKING: does `whirlwind` obscure the target too much to fight?

`whirlwind` is the first set piece to hold a 128×256 frame on screen for
over a second (1200ms — three times longer than a descent, and this
project's first sustained tall-frame effect). A tall, wide, 1.2s-long
effect sitting on an enemy has real potential to block the player's view of
their own target mid-fight.

With `impact_vfx: "whirlwind-fire"` still set (or switch to it), cast at an
NPC and watch its **full 1200ms duration**, specifically thinking about
whether you could track HP/position/tells on that NPC while it's up.

**Expect:** the funnel is visually prominent but the NPC's silhouette,
health bar, and position stay reasonably trackable throughout — a strong
effect, not a blackout.

**Failure looks like — a REAL, BLOCKING judgment call:** for a meaningful
portion of the 1200ms, the NPC's sprite/HP bar is hard to make out under the
funnel — i.e. the effect functions like a visual blindfold during combat,
not just a flashy hit. If you judge it that way, **do not wave it
through** — record it explicitly; the remedy (thinner bands, fewer bands,
lower alpha, shorter duration) is a follow-up decision, not something to
silently accept here.

## Step 5: Editor — `arcane-rain` motes fall staggered, pop on contact

Pick `Arcane Rain`, cycle through the 7 elements (`arcane-rain-<el>`, base
cycle — `1×`), and watch the preview loop closely.

**Expect:** the 7 motes do **not** all fall in unison — they launch and
land at visibly different times (a staggered barrage, not a synchronized
curtain), each trailing a short motion streak while falling, and each pops
in a bright flare where it lands rather than just disappearing.

**Failure looks like:** all motes appear to fall/land at the same instant
(reads as a curtain, not a barrage); a mote just vanishes instead of
flaring on contact; or motes show no motion streak and look like they're
teleporting between positions rather than falling.

**Known-and-accepted, not a bug:** the motes land across only the **last
two** sampled frames — 3 of the 7 land on frame 2, the remaining 4 on
frame 3 (none land on frames 0 or 1). This is a deliberate consequence of
the stagger/land-timing constants (documented in `src/vfx-engine/kinds.ts`
next to `ARCANE_LAND_T`), not something to report as uneven distribution.

## Step 6: Editor — ⚠ BLOCKING: does `arcane-rain-<el>-x2` read as a second wave?

Still on `Arcane Rain`, switch the Cycles control to `2×` for a couple of
elements (e.g. `arcane-rain-fire-x2`, `arcane-rain-dark-x2`) and watch the
full loop.

**Expect:** after the first 7-mote barrage lands and pops, a **second,
visually distinct** barrage of 7 motes launches and falls the same way —
it should read as "another wave incoming," with a clear beat between the
two waves.

**Failure looks like — a REAL, BLOCKING judgment call:** the second
barrage reads as a stutter or repeat-glitch of the first (no clear
gap/beat between them, or it looks like the animation hiccuped and
restarted) rather than a deliberate second wave. If you judge it as a
stutter, record that verdict explicitly.

## Step 7: Editor — `poison` bubbles rise and pop, quickly

Pick `Poison`, cycle through the 7 elements (`poison-<el>`), and watch the
preview loop.

**Expect:** a low haze/puff sits under the figure, with small bubbles
rising up out of it and popping — the whole animation is **fast**, over in
a beat rather than lingering.

**Failure looks like:** no visible haze; bubbles don't appear to rise (just
flicker in place); bubbles never visibly pop (just fade or cut off); or the
effect visibly lingers/loops rather than reading as one quick burst.

**Known-and-accepted, not a bug:** `poison` is deliberately only **400ms**
total (4 frames × 100ms, no cycles) — much shorter than every other set
piece. This is a contract, not an oversight: it's meant to fire on every
DoT tick, and the authored `poison` status ticks at 1000ms, so a longer
effect would overlap itself and read as a smear.

## Step 8: Game — `poison-earth` lands on the body, clears fast; ⚠ BLOCKING: do the simultaneous pops read correctly?

Edit `strike.json`'s `impact_vfx` to `poison-earth` and cast at an NPC.

**Expect:** the puff/bubbles appear centred on the **NPC's body** (chest
height), not down at its feet — `poison` uses the square, body-centred
frame, unlike the tall descents. The whole thing clears well before a
second elapses (400ms).

**Also judge — a REAL, BLOCKING judgment call:** with only 4 sampled
frames across 400ms, all 5 bubbles reach their pop threshold on the **same
final sampled frame** — there was no room left in the budget to stagger
their pops the way `arcane-rain`'s landings are staggered. This was a
deliberate, accepted tradeoff (documented next to `POISON_POP_T` in
`src/vfx-engine/kinds.ts`), not something overlooked — the question here is
**whether it still looks right** watching all 5 pop together, not whether
it can be changed within the current 400ms/4-frame budget. If the
simultaneous pop reads as messy or wrong rather than as one clean burst,
record that verdict explicitly; the only real remedy (fewer bubbles, or a
longer duration) trades against the 400ms DoT-tick contract from Step 7 and
should be an explicit follow-up decision, not a silent fix.

**Failure looks like:** the effect appears at the NPC's feet rather than on
its body; it visibly lingers past ~400ms; or (separately from the
judgment call above) bubbles don't pop at all — just vanish or fade.

## Step 9: Game — existing effects are unmoved

Cast each of the following at an NPC via `impact_vfx` (edit `strike.json`
between casts) and compare against what you remember from before this
project:
```
fire-impact
smite-dark-x2
ring-of-fire-fire
cleave-dark-x2
swordfall-dark
```

**Expect:** every one of these looks, times, and lands exactly as it did
before — same shape, colour, size, timing, ground contact point. None of
them should look shifted, resized, or otherwise touched. (`fire-impact` is
a curated sprite-sheet burst, structurally untouched by any of this
project's `kinds.ts`/`registry.ts` work — it's included here as the
"nothing leaked into the sheet path" check.)

**Failure looks like:** any of the five renders differently than you recall
— shifted position, different size/timing, wrong colour, or (for
`fire-impact`) a broken/missing sheet image. Any of those would be a
serious regression and should be escalated immediately, since Tasks 1-3
claim to be purely additive.

## Step 10: Game — `whirlwind` stays anchored to a moving target

Set `impact_vfx` back to `whirlwind-wind`, cast at an NPC, and **immediately
start walking** your character away while the 1200ms effect is still
playing.

**Expect:** the funnel stays pinned to the NPC's tile/position — it does
not drift with your camera or appear to travel with you as you walk. (This
is a regression check on the burst-anchoring fixes in `ffd9ebe` and
`5334d56`: those fixed a bug where a burst's position was baked once at
cast time and never refreshed, so it would visibly drift with the camera
once the effect outlived the frame it was cast in. `whirlwind` at 1200ms is
easily long enough to walk during, which is exactly the scenario those
fixes targeted.)

**Failure looks like:** the funnel visibly slides across the screen as you
walk, instead of staying put over the NPC — that would mean the anchoring
fix regressed for this specific long-duration effect.

## Restore

Set `strike.json`'s `cast_vfx`/`impact_vfx` back to the values you noted in
Prerequisites before starting. Then from a terminal:
```
git -C /Users/cfraser/Projects/reoserv status --short
```
**Expect:** `strike.json` shows no diff from what it was before this pass
(or, if it already carried unrelated WIP before you started, it matches
that same pre-existing diff — not a new one). If `strike.json` still shows
an unexpected change, re-edit it back to the noted values, save, and
re-check.

---

## Sign-off

Record whether all of the above matched expectations, and flag anything
that didn't — **especially the four blocking judgment calls: Step 3
(enclose vs. decal), Step 4 (does 1200ms of `whirlwind` block the fight),
Step 6 (second wave vs. stutter for `arcane-rain-<el>-x2`), and Step 8
(does `poison`'s simultaneous 5-bubble pop read correctly)**. None of the
four has an automated substitute; all four are explicitly unresolved as of
this pass. This doc doesn't self-certify — a human needs to watch both
canvases and say so.

If any of Tasks 1-3's underlying code needs a fix as a result of this pass
(rather than just recording a judgment call), that is a **finding against
Tasks 1-3**, not something to patch as part of this verification task —
report it back rather than editing `src/vfx-engine/kinds.ts` directly here.
