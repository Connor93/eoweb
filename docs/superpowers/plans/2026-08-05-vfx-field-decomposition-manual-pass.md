# VFX Field Decomposition — Manual Verification Pass

> Human/controller pass, not a subagent task — needs a browser and eyes on
> the aio-editor form. Companion to the automated gates (`tsc`, `biome`,
> `pnpm vfx:check`, `pnpm vfx:parity`), which already prove the registry is
> well-formed and the vendored copy hasn't drifted. This pass proves the
> **Shape × Element × Size** pickers actually behave the way the spec says —
> composition, axis memory, and (the two steps that matter most, 7 and 9)
> that a custom value never gets silently rewritten and a combo never offers
> a size that doesn't exist.

## Every name below was checked, not picked by eye

The predecessor VFX project shipped a doc whose running example
(`impact-water-lg`) never existed — `impact` was never a real shape kind.
To not repeat that, every name cited below was verified against a live
`buildRegistry()`/`buildIndex()`/`buildShapes()` call
(`pnpm exec tsx .superpowers/verify-vfx-names.ts` from `eoweb/`, a
throwaway git-ignored script — not part of the repo). Output:

```
# Existence table (buildRegistry() / buildIndex())

| name | in registry | in index | expected | status |
|---|---|---|---|---|
| `nova-fire-lg` | true | true | EXISTS | PASS |
| `nova-sparkle-fire` | true | true | EXISTS | PASS |
| `heal-glow` | true | true | EXISTS | PASS |
| `nova-water` | true | true | EXISTS | PASS |
| `cast-burst` | false | false | ABSENT | PASS |
| `fire-impact` | false | false | ABSENT | PASS |
| `nova-sparkle-fire-lg` | false | false | ABSENT | PASS |
```

`cast-burst` / `fire-impact` are the two curated sprite-sheet effects —
they resolve through eoweb's VFX **manifest**, a separate hand-authored
system, not through this procedural registry, so their absence here is
correct and expected, not a gap. `nova-sparkle-fire-lg` is absent because
**combos are generated at base size only** — `buildShapes()` sets
`hasSize: false` on every combo shape, and `composeVfxName` ignores any
`size` argument passed for a combo `shapeId`. That's not an edge case the
UI papers over; step 5 below turns it into a deliberate test.

---

## Step 1: Prereqs

aio-editor running both halves, from `/Users/cfraser/Projects/aio-editor`:
```
npm run dev:backend
npm run dev:frontend
```
Open the frontend, sign in, go to **Pubs**, select the **skills** type, and
open **strike** (`data/pub/skills/strike.json` on disk).

**You do not need eoweb or reoserv running.** This change is editor-only —
the preview canvas renders from the vfx-engine vendored straight into
aio-editor (`packages/frontend/src/vfx-engine/`, kept in sync with eoweb's
canonical copy by `pnpm vfx:parity`), the same Canvas2D code the game uses,
just called locally in the browser tab. Don't start `cargo run` or
`pnpm dev` for this.

Note strike's current values before you touch anything — you will restore
these exactly in step 12:
```json
"cast_vfx": "cast-burst",
"impact_vfx": "fire-impact"
```

Everything below happens in the **Form** view unless a step says otherwise
(there's a Form/JSON toggle top-right of the editor panel). Edits live in
the in-memory draft (an **unsaved** badge appears next to the filename)
until you click **Save to staging** — which writes to
`reoserv/data/pub/.staging/`, a git-ignored scratch directory, **not** the
tracked file. Do **not** click **Push to live** anywhere in this pass —
there's no need to, and it's the one button that would actually modify the
tracked `reoserv/data/pub/skills/strike.json` you're required to leave
clean. Step 12 tells you how to recover if you click it by accident.

**Failure looks like:** the editor fails to start, or `strike` doesn't
appear in the skills list — stop and fix the environment before continuing;
none of the following steps are meaningful without it.

## Step 2: Decomposition

With `strike` open in Form view, find the `cast_vfx` field.

**Expect:** the select shows `cast-burst (sheet)`; the element swatch row
(7 circles) and the size row (S/M/L) are both greyed out
(`disabled`/`opacity-25`); no `→ ...` composed-name line appears (it's
suppressed for sheets); the preview box shows the muted text **"no preview
(sheet/unknown)"** — a checkered background, no canvas, no ▶/⏸ button.
Check `impact_vfx` too: identical story, `fire-impact (sheet)`.

**Failure looks like:** either field shows enabled swatches/size buttons,
or the preview renders *something* (an animating canvas, an error, a blank
white box) instead of the muted placeholder text. Any of those means a
sheet name is being looked up in the procedural registry instead of being
short-circuited — block on this.

## Step 3: Matrix

On `cast_vfx`, open the shape select and choose **Nova**. Click the fire
swatch (2nd circle, orange). Click size button **L**.

**Expect:** the mono line under the controls reads exactly
`→ nova-fire-lg`; the preview canvas animates an orange radial nova/flash;
switching to **JSON** view shows `"cast_vfx": "nova-fire-lg"` in the draft
(the `impact_vfx` line is untouched, still `"fire-impact"`).

**Failure looks like:** the `→` line shows a different string (a missing
`-lg` suffix, a `-base` suffix instead of none, wrong element), the preview
stays static/blank, or the JSON view doesn't reflect the change at all
(stale draft) — any of those is a composition bug, not a display glitch.

## Step 4: Element switching

Still on Nova/fire/L, click through all 7 element swatches in order:
neutral, fire, water, earth, wind, light, dark (hover shows the element
name as a tooltip if you want to confirm order).

**Expect:** each click retints the preview (neutral = pale cream, fire =
orange, water = blue, earth = green, wind = yellow, light = pale yellow,
dark = purple) and the `→` line updates its element segment each time,
e.g. `→ nova-water-lg`, `→ nova-earth-lg`. Size stays `L` throughout (you
didn't touch the size row).

**Failure looks like:** the preview color doesn't change on some chip, the
`→` name doesn't update, or clicking one chip changes the *size* segment
instead of the element segment (axis bleed).

## Step 5: Combo

Change the shape select to **Nova + Sparkle**.

**Expect:** element row stays enabled (fire, or whatever you last had, is
still highlighted) — **but the size row greys out entirely**, no S/M/L
button highlighted. The `→` line reads `→ nova-sparkle-fire` (no size
suffix, regardless of what size was selected before). This is the rule the
old flat 381-entry dropdown hid: combos only ever exist at base size, so
`nova-sparkle-fire-lg` is not a thing you can pick, and the UI now makes
that visible instead of silently ignoring your size click.

**Failure looks like:** the size row stays enabled/clickable, or clicking a
size button while on a combo changes the composed name to something with a
`-lg`/`-sm` suffix (there is no such registry entry — `nova-sparkle-fire`
programmatically confirmed to exist, `nova-sparkle-fire-lg` confirmed
absent, see the table above).

## Step 6: Special

Change the shape select to **Heal Glow**.

**Expect:** *both* the element row and the size row grey out completely —
nothing highlighted in either. The `→` line reads `→ heal-glow`. The
preview shows a soft green glowing disc.

**Failure looks like:** either axis row stays enabled/clickable, or the
name carries an element/size suffix (`heal-glow-fire`, `heal-glow-lg`) —
specials are fixed, hand-tuned defs with no axes at all.

## Step 7: Axis memory ⚠ high value

Starting from `nova-fire-lg` (redo step 3 if you're not still there):
switch the shape select to **Heal Glow**, confirm it reads `→ heal-glow`
per step 6, then switch the shape select back to **Nova**.

**Expect:** the element row shows **fire** highlighted again and the size
row shows **L** highlighted again, with the `→` line back to exactly
`→ nova-fire-lg` — restored, not reset. The component remembers the last
element/size you actually dialed in even while passing through an axis-less
shape.

**Failure looks like:** switching back to Nova shows neutral/no element
highlighted and/or **M** (base) highlighted instead of fire/L — i.e. the
axes silently reset to their defaults instead of being restored. **This is
one of the two highest-value checks in this pass; if it resets, block.**

## Step 8: None

Change the shape select to **None**.

**Expect:** both axis rows grey out, no `→` line renders at all (it's
suppressed for None same as for sheets), and — this is the part that
matters — switching to **JSON** view shows `"cast_vfx": ""`, an **empty
string**, not the literal text `"none"`.

**Failure looks like:** the JSON view shows `"cast_vfx": "none"` (the
internal sentinel leaking into the stored value) or the field is removed
from the JSON entirely instead of being set to `""`.

## Step 9: Custom preservation ⚠ high value

Switch to **JSON** view. Find the `"cast_vfx"` line (currently `""` from
step 8) and hand-edit it to:
```json
"cast_vfx": "zzz-nonsense",
```
Switch back to **Form** view.

**Expect:** the shape select shows a pinned option
**`⚠ Custom: zzz-nonsense`**, selected, with the select's border tinted
amber; directly below it, the text **"not a known effect — kept as-is"** in
amber; both axis rows greyed out; no `→` line (suppressed for custom, same
as sheet/none); the preview shows the muted "no preview" state. Now click
**Save to staging** and confirm the "unsaved" badge clears and the status
line reads "saved to staging". Switch away to another field and back (or
reselect `strike` from the file list) to force a re-read of the saved
draft, then check the JSON view again.

**Expect after the round-trip:** `"cast_vfx"` is still exactly
`"zzz-nonsense"` — untouched, not rewritten to `""`, not dropped, not
coerced into some canonicalized/known name.

**Failure looks like:** the select silently jumps to `None` or some other
shape instead of showing the pinned Custom option; the warning text is
missing; clicking an (enabled) axis control changes the value out from
under you; or — the actual data-loss case — after the save round-trip the
field comes back as `""`, `null`, missing, or any string other than
`zzz-nonsense`. **This is the other highest-value check in this pass: any
of these blocks**, because it means the editor destroys unrecognized
author-entered strings instead of passing them through.

## Step 10: Raw toggle

With `zzz-nonsense` still showing the Custom warning, click the **`›`**
button next to the select.

**Expect:** the picker UI is replaced by a plain text input pre-filled with
`zzz-nonsense`, plus a **`‹`** button to go back. Clear it and type
`nova-water`, letting the datalist (typing `nova-` should offer
autocomplete suggestions covering the full palette) confirm the value.
Click **`‹`**.

**Expect:** back in the picker UI, the select shows **Nova**, the water
swatch is highlighted, size shows **M** (base — `nova-water` has no size
suffix), and the `→` line reads `→ nova-water`.

**Failure looks like:** the `‹` button doesn't return to the picker view,
or it returns but shows the wrong shape/element (anything other than
Nova/water/base) — meaning the raw text you typed didn't decompose
correctly back through `buildIndex()`.

## Step 11: No collateral damage

Set `cast_vfx` back to `""` (None) so you're not carrying a stray edit into
the next check (or just note you'll fix it in step 12 regardless).

Open an **item** pub and locate its `icon_id` field.

**Expect:** `icon_id` still renders as a plain text input with a datalist
dropdown — no shape/element/size pickers, no preview canvas. This field
matches `x-aio-suggest` but its path doesn't end in `cast_vfx`/`impact_vfx`,
so it should be completely unaffected by this change.

Then open an **NPC** pub (any entry) and confirm the form renders normally
end to end, with the browser console clean (no red errors) throughout this
whole pass, not just this step.

**Failure looks like:** `icon_id` shows element/size pickers or a preview
box (routing leaked to a field it shouldn't have), or the NPC form throws /
fails to render, or you spot any console error anywhere in this pass.

## Step 12: Restore

Return to `strike`. In **JSON** view, hand-edit both fields back to their
original values:
```json
"cast_vfx": "cast-burst",
"impact_vfx": "fire-impact"
```
Confirm the Form view shows both fields back in their step-2 state
(`cast-burst (sheet)` / `fire-impact (sheet)`, both greyed out, muted "no
preview").

You do **not** need to click Save — you were told in step 1 not to click
**Push to live**, and everything up to now only ever touched the in-memory
draft or the git-ignored staging directory, never the tracked file. If you
*did* click Push to live at some point (accidentally or to double check
something), click **Save to staging** now with the restored values, then
click **Push to live** once to write the restoration back out.

Finally, from a terminal:
```
git -C /Users/cfraser/Projects/reoserv status --short
```

**Expect:** exactly the two pre-existing WIP lines that were already there
before you started —
```
 M data/pub/npcs/0007.json
 M data/pub/skills/rage.json
```
— and nothing mentioning `strike.json` or anything else.

**Failure looks like:** `data/pub/skills/strike.json` (or any other file)
shows up in that status output. If it does, something in this pass reached
`Push to live` in a state that didn't match the original values, or reached
it when it shouldn't have at all — fix it by re-editing `strike.json` in
the editor to the exact two lines above and pushing again, then re-check
`git status` before considering this pass done.

## Step 13: Cross-file field-instance bleed (cosmetic, informational)

`PubBrowser.tsx` renders `<SchemaForm>` with no `key`, and `ObjectField` keys
its children by property name — so switching which skill file is open does
**not** remount the `VfxField` component for `cast_vfx`/`impact_vfx`; the
same React instance (and its `raw` toggle state and `lastElement`/`lastSize`
axis-memory refs) is reused across files. Nothing writes on mount, so no
stored value can be corrupted — this check is presentation-only and does
**not** block the merge; it exists so a human confirms whether the bleed is
acceptable as-is.

With `strike` open and `cast_vfx`/`impact_vfx` restored to `cast-burst` /
`fire-impact` per step 12: on `cast_vfx`, redo step 3 — pick **Nova**, click
the **fire** swatch, click size **L** — so the field carries a memorable,
distinct state (`→ nova-fire-lg`). Then click **`›`** to put `cast_vfx`
into raw-text mode.

Without saving anything, switch to a different skill file in the list —
**bash** (`data/pub/skills/bash.json`; `cast_vfx` is unset/empty on disk) —
and look at its `cast_vfx` field.

**Expect / record:** note whether `bash`'s `cast_vfx` opens already in the
raw-text `‹` view (the `raw` toggle carried over from `strike`) instead of
the picker a freshly-opened field should show. Then — clicking **`‹`**
first if you're in raw view — open the shape select and pick **Nova**
again: note whether the element/size swatches immediately highlight
**fire/L** (carried over from `strike`) instead of defaulting fresh to
neutral/base.

A `key={selection.filename}` on `SchemaForm` would remount and fix this,
but was deliberately left out of this change — it would also reset every
*other* field's local state (any other open raw-mode toggle, any in-progress
edit), so it belongs in its own follow-up change, not this merge. Record
what you observed and whether it's acceptable to ship as-is; either answer
is fine, this step does not block.

**Failure looks like:** anything other than the presentation bleed
described above — a crash, a console error, or (unlike the cosmetic case)
`bash`'s actual stored `cast_vfx` value changing in the JSON view as a
result of switching files — would mean this isn't the purely-cosmetic bug
the review described, and should be escalated rather than just logged.

Finish by switching back to `strike` and confirming/restoring `cast_vfx`/
`impact_vfx` to `cast-burst`/`fire-impact` (undo this step's Nova/fire/L
detour). You did not click Save to staging or Push to live anywhere in this
step, so `git -C /Users/cfraser/Projects/reoserv status --short` is
unaffected and still shows only the two pre-existing WIP lines from step 12.

---

## Sign-off

Record in the vault ([[AIO Editor]] / VFX field decomposition planning
note, per the user's usual session wrap-up) whether all of the above
matched expectations, and flag anything that didn't — this doc doesn't
self-certify; a human needs to actually click through the pickers and say
so.
