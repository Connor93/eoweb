# Sword Set Pieces (`cleave` + `swordfall`) — Manual Verification Pass

> Human/controller pass, not a subagent task — needs a browser, a running
> reoserv dev server, and eyes on two canvases (the game and the aio-editor
> preview). Companion to the automated gates that already passed for this
> branch (`npm run vfx:check` — 491 effects / 37 shapes, round-trip OK;
> `npm run vfx:parity` — 10 files match, registry keys identical between
> repos; `cd ../aio-editor && npm run typecheck` — clean across both
> workspaces, including `noUncheckedIndexedAccess`/`noUnusedLocals`; and both
> `npm run build`s succeeding). **None of those gates can tell you whether a
> swing reads as a swing instead of a stutter, or whether a sword reads as a
> sword instead of a glowing stick** — that is what this pass is for, and
> nobody has looked at either effect in a browser before this task.

## Names cited below, verified against a live build, not picked by eye

Prior VFX manual-pass docs in this series learned this the hard way once
(`impact-water-lg` in an earlier doc's running example never existed — `impact`
was never a real shape kind). Every name and number cited below was checked
against a live `buildRegistry()` / `buildIndex()` / `buildShapes()` call
(`npx tsx .superpowers/verify-task4-names.ts` from `eoweb/`, a throwaway
git-ignored script — not part of the repo). Output:

```
Total registry size: 491 (expect 491)
Total shapes: 37 (expect 37)

| name               | in registry | in index | frames | loops | frameMs | kind      | frame(outW x outH) | anchorY |
|--------------------|-------------|----------|--------|-------|---------|-----------|---------------------|---------|
| cleave-fire        | true        | true     | 4      | 1     | 100     | cleave    | 132x132             | 0.5     |
| cleave-water       | true        | true     | 4      | 1     | 100     | cleave    | 132x132             | 0.5     |
| cleave-wind        | true        | true     | 4      | 1     | 100     | cleave    | 132x132             | 0.5     |
| cleave-earth       | true        | true     | 4      | 1     | 100     | cleave    | 132x132             | 0.5     |
| cleave-light       | true        | true     | 4      | 1     | 100     | cleave    | 132x132             | 0.5     |
| cleave-dark        | true        | true     | 4      | 1     | 100     | cleave    | 132x132             | 0.5     |
| cleave-neutral     | true        | true     | 4      | 1     | 100     | cleave    | 132x132             | 0.5     |
| cleave-fire-x2     | true        | true     | 8      | 1     | 100     | cleave    | 132x132             | 0.5     |
| cleave-fire-x3     | true        | true     | 12     | 1     | 100     | cleave    | 132x132             | 0.5     |
| swordfall-fire     | true        | true     | 4      | 1     | 100     | swordfall | 132x264             | 0.75    |
| swordfall-water    | true        | true     | 4      | 1     | 100     | swordfall | 132x264             | 0.75    |
| swordfall-wind     | true        | true     | 4      | 1     | 100     | swordfall | 132x264             | 0.75    |
| swordfall-earth    | true        | true     | 4      | 1     | 100     | swordfall | 132x264             | 0.75    |
| swordfall-light    | true        | true     | 4      | 1     | 100     | swordfall | 132x264             | 0.75    |
| swordfall-dark     | true        | true     | 4      | 1     | 100     | swordfall | 132x264             | 0.75    |
| swordfall-neutral  | true        | true     | 4      | 1     | 100     | swordfall | 132x264             | 0.75    |
| swordfall-dark-x3  | true        | true     | 4      | 3     | 100     | swordfall | 132x264             | 0.75    |
| fire-impact        | false       | false    | -      | -     | -       | -         | -                   | -       |
| smite-dark-x2      | true        | true     | 4      | 2     | 100     | smite     | 132x264             | 0.75    |
| ring-of-fire-fire  | true        | true     | 4      | 3     | 100     | ring-of-fire | 132x132          | 0.5     |

Set-piece shapes:
{"id":"setpiece:bolt","label":"Bolt","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":true}
{"id":"setpiece:smite","label":"Smite","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":true}
{"id":"setpiece:rockfall","label":"Rockfall","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":true}
{"id":"setpiece:ring-of-fire","label":"Ring Of Fire","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":false}
{"id":"setpiece:cleave","label":"Cleave","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":true}
{"id":"setpiece:swordfall","label":"Swordfall","layer":"setpiece","hasElement":true,"hasSize":false,"hasCycles":true}
```

`fire-impact` is `false`/`false` as expected — it's a curated sprite-sheet
name (`SHEET_DEFS`), never a registry entry, same as every prior doc in this
series noted for `cast-burst`. `cleave-fire-x2`/`-x3` show `cycleMode:
'frames'` in action (frames scale 4→8→12, loops pinned at 1); `swordfall-
dark-x3` shows `cycleMode: 'loop'` (frames stay 4, loops scale to 3) — the
two modes Task 1 introduced, confirmed live rather than assumed from the
plan.

## Prerequisites

- reoserv running against its normal dev config (`cargo run` from
  `/Users/cfraser/Projects/reoserv`), with a character that can reach an NPC
  to hit (needed for checks 8–11; not needed for checks 1–7).
- eoweb dev server running (`npm run dev` from `/Users/cfraser/Projects/eoweb`),
  logged in with that character (needed for checks 8–11).
- aio-editor running both halves (`npm run dev:backend` then `npm run
  dev:frontend` from `/Users/cfraser/Projects/aio-editor`), a skill open in
  the form editor (needed for checks 1–7 only — reoserv/eoweb are not
  required for those).
- A scratch skill's `cast_vfx`/`impact_vfx` fields to edit for checks 8–11
  (e.g. `data/pub/skills/strike.json` in reoserv — reoserv hot-reloads pub
  edits, no restart needed between rounds). **Before editing it, note its
  current `cast_vfx`/`impact_vfx` values** (the reoserv tree already carries
  unrelated uncommitted WIP on other pub files — this branch should not add
  to it) so you can put them back exactly at the end. Do not leave the
  scratch skill in a modified state when you're done.

## What's new here, briefly

Two new **set pieces** — `cleave` (an energy-crescent diagonal slash) and
`swordfall` (a literal blade falling from the sky) — sit alongside the
existing `bolt`/`smite`/`rockfall`/`ring-of-fire`, each authored ×7 elements
(491 names, 37 shapes, up from 449/35). `cleave` uses the ordinary square
132×132 frame (`anchorY 0.5`) and lands on the caster's/target's **body**,
like a swing should. `swordfall` uses the same tall 132×264 frame
(`anchorY 0.75`) as the other descents and lands at the **feet**.

The one new engine idea is `cycleMode`. Every prior cycling set piece
(`bolt-fire-x2`, `smite-dark-x3`, …) just repeats the same rasterised frames
more times (`cycleMode: 'loop'`) — correct when every cycle looks identical.
`cleave`'s flurry needs each cycle to be visually different (`-x2` mirrors
into an X, `-x3` comes in steeper) so it multiplies `frames` instead
(`cycleMode: 'frames'`), rasterising each cycle as its own texture.
`swordfall` stays `'loop'` — repeated sword strikes are meant to look
identical.

---

## Checklist

### 1. Editor — Cleave's controls: Element + Cycles, no Size

Open aio-editor, a skill's `cast_vfx` field, and pick Shape **`Cleave`**.

**Expect:** the 7 element chips are enabled, and where a Size control (S/M/L)
would sit for an ordinary kind, you instead see a **Cycles** control (`1× /
2× / 3×` buttons) — `cleave` has `hasSize: false, hasCycles: true`, so the
axis area shows cycles, not a disabled/greyed size row.

**Failure looks like:** a Size control (S/M/L) appears instead of, or
alongside, the Cycles control; or the Cycles buttons are absent/disabled.

- [ ] Checked

### 2. Editor — `cleave` per element: weighted swing, not a uniform stroke

For each of the 7 elements, set `cast_vfx` to `cleave-<element>` (`cleave-
fire`, `cleave-water`, `cleave-wind`, `cleave-earth`, `cleave-light`,
`cleave-dark`, `cleave-neutral`) and watch the preview play through its 4
frames.

**Expect:** the crescent reads as a weighted swing — the leading edge is
visibly **thicker and hotter** (brighter) than the tail, which should look
thin and faint by comparison. This is the deliberate difference from the
`slash` matrix kind (one thin uniform stroke, unchanged by this project).

**Failure looks like:** the band looks like a uniform-width, uniform-
brightness stroke end to end (no visible taper or brightness gradient); or
the effect doesn't read as a swing/crescent shape at all.

- [ ] Checked

### 3. Editor — `cleave` at `x2`: mirror forming an X — BLOCKING JUDGEMENT CALL

Set `cast_vfx` to `cleave-fire-x2` (or any element) and watch the full
playback — 8 frames now, two cleaves back to back.

**Expect:** the second cleave is a clear mirror of the first, together
forming an X shape.

**⚠ BLOCKING JUDGEMENT CALL — record your verdict explicitly, do not wave it
through:** does the pair read as **one combo** (two swings that belong
together, forming a deliberate X), or as **a stutter** (the same swing
repeating, or a jarring restart that doesn't read as a second, distinct
strike)? There is no automated substitute for this call — `vfx:check` only
proves the geometry is a mirror (`mirror: index % 2 === 1` in `cleavePhase`),
not that the mirror *reads* as intentional at 100ms/frame. If it reads as a
stutter, say so and flag it for follow-up rather than accepting it silently.

- [ ] Checked — verdict: combo / stutter (circle one, and note why)

### 4. Editor — `cleave` at `x3`: steeper third, not a repeat of the first

Set `cast_vfx` to `cleave-fire-x3` (or any element) and watch the full
playback — 12 frames, three cleaves.

**Expect:** the third cleave comes in **visibly steeper** than the first
(rotated, not just mirrored back) — `cleavePhase` rotates cycle index 2 by
`-0.2π`, so it should look like a genuinely different angle of attack, not a
mirror-of-the-mirror landing back on cleave 1's line.

**Failure looks like:** the third cleave looks identical to the first
(no visible rotation), or the sequence reads as only two distinct angles
repeating rather than three.

- [ ] Checked

### 5. Editor — `swordfall` per element: sword or bright stick? — BLOCKING JUDGEMENT CALL

For each of the 7 elements, set `cast_vfx` to `swordfall-<element>` and watch
the full 4-frame playback, particularly the **planted** frames (after it
lands).

**⚠ BLOCKING JUDGEMENT CALL — record your verdict explicitly, do not wave it
through:** does the planted blade read as a **sword** (a silhouette with a
legible blade, crossguard, grip, and pommel), or as a **bright stick** (a
glowing line/blob with no legible hilt structure)? This is the headline risk
of the `swordfall` design — a literal shape drawn at 44×88 internal, then
crushed through the 4-rung colour quantiser, may not survive as "sword"
regardless of how carefully the geometry (`swordfallBlade`'s tapered blade +
crossguard rect + grip rect + pommel circle) was authored.

**If it fails:** the agreed fallback, already decided, is a **descending
wedge of force** — not more blade detail. Do not propose adding more
geometric detail to the hilt as a fix; the plan is explicit that fine detail
is exactly what the quantiser destroys, so more detail will not rescue this
if the silhouette itself fails to read. Record which element(s) (if any)
fail and which pass — the ramp math means `fire`/`dark`/`water` clear a
dimmer hot-rung than `neutral`/`light`/`wind`/`earth` (see the inherited
tint glow-vs-blob note in the prior VFX set-pieces manual-pass doc, Step 9),
so a per-element split verdict is plausible, not just pass/fail as a whole.

- [ ] Checked — verdict: sword / bright stick, per element (list which)

### 6. Editor — `swordfall` frame 0: hilt clipping reads as off-screen entry

Set `cast_vfx` to `swordfall-<any element>` and step to (or watch) the very
first frame.

**Expect:** frame 0 samples `progress = 0.125`, so `above = 140.625` — the
sword's top (the pommel) sits 257.6 design-px above the ground point against
only 192px of headroom, so 65.6px is clipped. The hilt (grip and pommel) is
entirely off-frame; what's actually visible is roughly 51.4px of the 84px
blade, cut flat at about 61% up the blade — **a hard flat cut through the
blade itself is the correct rendering for this frame**, not a failure. This
should read as "the sword is still entering from off-screen above," not as a
rendering glitch. (`SWORDFALL_START_ABOVE` is 150px, deliberately taller than
the frame's headroom on the first frame.)

**Failure looks like:** the visible blade stub reads as an ambiguous
bright shape with no sense of a tapered blade continuing upward out of
frame — e.g. the quantiser collapses it into a blob with no visible taper or
edge direction, so there's nothing to suggest "more sword above" rather than
"a broken sprite."

- [ ] Checked

### 7. Editor — `swordfall` planted frames: whole sword on screen, impact ring reads

Continue watching `swordfall-<any element>` through to the planted frames
(progress ≥ 0.5).

**Expect:** by the time it's planted, the **entire** sword — blade, guard,
grip, and pommel — is fully on screen within the tall frame (arithmetically
guaranteed: `SWORDFALL_TOTAL_HEIGHT` is 117 design-px against
`TALL_FRAME`'s 192px of headroom above the ground point, verified by
`vfx:check`'s extent assertion — but confirm it actually *looks* right, not
just fits by the numbers). An expanding, fading impact ring should be
visible at the base, and (behind the character) a dust wedge should appear
briefly at the moment of landing.

**Failure looks like:** any part of the sword (especially the pommel/grip at
the top) is cut off even once planted; the impact ring is missing, invisible,
or doesn't visibly expand/fade; or the dust wedge behind is missing entirely
in the frames right after landing.

- [ ] Checked

### 8. Game — `cleave-fire` lands on the caster's body, not their feet

Set a skill's `cast_vfx` to `"cleave-fire"` (e.g. edit the scratch skill's
pub, per Prerequisites) and cast it.

**Expect:** the crescent renders centred on the **caster's body** (roughly
chest height), not down at their feet — `cleave` uses the ordinary square
frame with `anchorY 0.5` and keeps the historic body-lift, exactly like the
existing swing/impact kinds it sits alongside, unlike `bolt`/`smite`/
`rockfall`/`swordfall`, which are ground-anchored descents.

**Failure looks like:** the effect appears at the caster's feet, floating
above their head, or off to one side instead of centred on the body.

- [ ] Checked

### 9. Game — `swordfall-dark` plants on the target with the damage number

Set the scratch skill's `impact_vfx` to `"swordfall-dark"` and cast it at an
NPC.

**Expect:** the blade plants on the **target**, at their feet (ground-
anchored, like `bolt`/`smite`/`rockfall`), and the plant/impact beat lands
together with the damage number and HP bar tick — the same "one moment, not
two" expectation the earlier descent set pieces were held to (no server-side
cast time exists, so the whole 4-frame/400ms descent has to read as
simultaneous with the hit).

**Failure looks like:** the blade lands somewhere other than the target
(caster, wrong tile, floating); or the damage number pops well before the
blade visibly finishes planting.

- [ ] Checked

### 10. Game — `swordfall-dark-x3` stays anchored to the target while walking

Set `impact_vfx` to `"swordfall-dark-x3"`, cast it at an NPC, and **walk**
your character immediately after casting (while the effect is still
playing — this one is a 3-loop set piece, so it has more runway than the
others to catch an anchoring bug).

**Expect:** the effect stays locked to the **target's** tile/entity as you
move — this is a regression check on the target-anchoring fix in `ffd9ebe`
(`fix(vfx): anchor skill bursts to their target entity, not the screen`) and
`5334d56` (`fix(vfx): keep a burst on its target's tile after the target
dies`), both already in this branch's history. `swordfall` is new code path
for those fixes to be exercised through, so this is genuinely new coverage,
not a formality.

**Failure looks like:** the effect stays fixed at the screen position where
it started instead of following the target, drifts as you walk, or vanishes/
jumps if the target dies mid-loop.

- [ ] Checked

### 11. Game — existing effects unchanged

Cast three pre-existing effects and confirm none of them moved or changed:
`fire-impact` (a sprite-sheet effect, unrelated code path — confirms nothing
leaked into `sheets.ts`), `smite-dark-x2` (an existing `cycleMode: 'loop'`
set piece — confirms Task 1's refactor left it byte-identical), and
`ring-of-fire-fire` (the one existing set piece with `hasCycles: false` —
confirms the cycles-invariant plumbing didn't touch the no-axis path).

**Expect:** all three look, time, and land exactly as they did before this
branch — same shape, same color, same duration, same anchor point.

**Failure looks like:** any visible difference from before this branch —
position, color, timing, or frame count. This would mean the "additive
only" claim doesn't hold and should be escalated immediately, since Tasks
1–3 were supposed to leave all 449 pre-existing names untouched.

- [ ] Checked

---

## Restore

Put the scratch skill's `cast_vfx`/`impact_vfx` fields back to the values
you noted in Prerequisites before you started. Then from a terminal:

```
git -C /Users/cfraser/Projects/reoserv status --short
```

**Expect:** only whatever pre-existing WIP lines were already there before
this pass (unrelated to this project) — nothing new introduced by testing
`cleave`/`swordfall` should remain.

---

## Sign-off

Record whether all 11 checks matched expectations, and flag anything that
didn't — **especially checks 3 and 5, the two blocking judgement calls**,
neither of which has an automated substitute:

- **Check 3:** does `cleave-<el>-x2` read as a combo or a stutter?
- **Check 5:** does `swordfall`'s planted blade read as a sword or a bright
  stick — per element, since the ramp math makes `fire`/`dark`/`water` a
  dimmer case than the other four?

If check 5 fails for any element, the next step is the agreed fallback (a
descending wedge of force), not more blade detail — that decision doesn't
need to be re-litigated here, only triggered. This doc doesn't self-certify;
a human needs to watch both canvases and say so.
