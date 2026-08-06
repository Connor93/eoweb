# VFX Set-Piece Tweaks — Cycles Axis, Ground Anchoring, Ring & Rockfall Art — Design

**Date:** 2026-08-06
**Repos:** eoweb (canonical engine + Pixi renderer) + aio-editor (vendored engine + preview)
**Status:** design approved by user 2026-08-06
**Follows:** [VFX set pieces](./2026-08-06-vfx-set-pieces-design.md) · [EO-idiom rework](./2026-08-06-eo-idiom-vfx-rework-design.md)

## Problem

The four set pieces shipped and render correctly in game. Playtesting surfaced four things:

1. **Descents play once.** `bolt`, `smite` and `rockfall` are one-shot (400ms). The user wants them to repeat — and wants the repeat count **authorable per skill**, not a global constant.
2. **Ring of fire floats at chest height.** It reads as a body effect when it should sit on the ground.
3. **Ring of fire's flames are weak** and its centre is empty, so it reads as an outline rather than a burning area.
4. **One boulder never lands.** Two of three rocks hit the ground; the third is still airborne when the effect ends.

## Root causes, where they aren't obvious

**Ring of fire floats because of a body lift it shouldn't receive.** `SkillVfxController.playBurst` applies `BURST_UP` (20px) when `resolved.anchorY === 0.5` — a rule that exists because the 379 legacy effects are authored as blobs centred on the *body*. Ring of fire is square, so its `anchorY` is exactly 0.5 and it inherits the lift despite being a *ground* effect. The condition infers intent from a number that happens to coincide.

**The third boulder was made not to land, on purpose — for a reason that doesn't hold.** `ROCKFALL_LAND_PROGRESS[2] = 1.5`, deliberately past the sampled range, so the rock stays airborne and keeps the `behind` layer painting on the final frame. That was done because the set-pieces work treated *any* empty layer-frame as a stutter risk. It over-generalised: **when every rock has landed, an empty `behind` layer is correct** — there is nothing behind the character. A `behind` frame that is empty while `front` paints is not a stutter.

## Decisions

### 1. Cycles as a third name axis — descents only

Generated exactly the way sizes are. Bare name means one cycle (as base size carries no suffix):

```
smite-dark        1 cycle    400ms
smite-dark-x2     2 cycles   800ms
smite-dark-x3     3 cycles  1200ms
```

**`ring-of-fire` gets no Cycles axis** and keeps its fixed 3-loop sustain. Being sustained is what it is; a one-cycle ring of fire isn't a thing anyone wants. This is not a special case — `hasElement` and `hasSize` already vary per shape (combos have element but not size), so `hasCycles: false` fits the model unchanged.

**Counts:** 3 descents × 7 elements × 3 cycle values = 63, plus `ring-of-fire` × 7 = 7 → **70 set-piece names**. Registry **407 → 449**. Shapes stay **35** (a shape is still `setpiece:smite`).

**This does not reopen the damage-sync decision.** Skills have no cast time, so descents were capped at 400ms to keep the impact within a few frames of the damage number. The *first* cycle still completes in 400ms; later cycles are flourish, reading as successive waves. Nothing about the first impact's timing changes.

### 2. Body lift becomes explicit

`FrameGeometry` gains `bodyLift: boolean`, and `playBurst` branches on that instead of `anchorY === 0.5`:

| preset | dims | groundY | bodyLift | used by |
|---|---|---|---|---|
| `SQUARE_FRAME` | 128×128 | 64 | **true** | the 379 legacy effects — unchanged behaviour |
| `GROUND_FRAME` | 128×128 | 64 | **false** | `ring-of-fire` |
| `TALL_FRAME` | 128×256 | 192 | **false** | the three descents |

`GROUND_FRAME` is dimensionally identical to `SQUARE_FRAME` and differs only in the flag — the ring's artwork does not move within its frame. Dropping the lift places its centre at the tile centre, which is where the character's feet are.

`ResolvedVfx` carries `bodyLift` through so `playBurst` can read it. **`buildSheet` must set `bodyLift: true`** — the two sprite sheets are body-centred and their behaviour must not change.

This also removes a float-equality comparison on a value derived by division, which worked only because `64/128` is exact in binary.

### 3. Ring of fire art

- **Flamier tongues:** taller and tapered, licking outward, each with its own index-derived phase so they flicker independently rather than pulsing in unison.
- **Filled centre, on the `behind` layer:** a quantised wash inside the ring, flickering with the tongues. On `behind` the character stands *on* the fill rather than under it — which is the point.

Extent must be re-measured after: ring of fire currently peaks at 32 of its 62px budget, so there is room, but taller tongues consume it.

### 4. Rockfall

`ROCKFALL_LAND_PROGRESS[2]` becomes a real landing (≈0.875) so all three rocks hit the ground. The resulting empty `behind` frame is correct and must be documented as such, so the next person measuring painted pixels doesn't "fix" it back.

**Note:** there is no committed assertion to relax — empty-frame checking has only ever lived in throwaway per-task scripts. This is a documentation change, not a code one.

## What stays untouched

No server, wire, or pub-format change — cycle counts ride the effect-name string exactly as sizes do. **Do not touch reoserv.** All 379 pre-existing names keep working unchanged, as do the two sprite sheets and every `SQUARE_FRAME` effect's on-screen position. `bolt`, `smite` and `rockfall`'s existing artwork is unchanged apart from rockfall's landing schedule. The editor needs a new control but no new plumbing — it reads per-shape axis flags already.

## Architecture

**Engine:**
- `types.ts` — `FrameGeometry.bodyLift`; add `GROUND_FRAME`; `makeFrame` gains the flag.
- `registry.ts` — a `CYCLES` table (`['', 1], ['x2', 2], ['x3', 3]`); the set-piece generation loop gains a cycles dimension **for descents only**; `SetPieceConfig` gains `hasCycles`; `VfxAxes` gains `cycles?: number`; `VfxShape` gains `hasCycles: boolean`; `buildIndex` emits cycles; `composeVfxName` gains a `cycles` parameter:

```ts
export function composeVfxName(
  shapeId: string,
  element?: ElementKey,
  size?: SizeKey,
  cycles?: number,   // 1 | 2 | 3; ignored by shapes without the axis
): string | null;
```

It must **ignore** `cycles` for shapes without that axis, exactly as it already ignores `size` for combos and set pieces. Four positional parameters of which two are conditionally meaningless is a smell — if the implementer prefers an options object for the trailing three, that is acceptable provided every call site is migrated and the round-trip assertion still covers all 449 names.
- `kinds.ts` — ring-of-fire tongues + centre fill; rockfall landing schedule.

**eoweb:** `ResolvedVfx.bodyLift`; `playBurst` branches on it.

**aio-editor:** `VfxField` gains a Cycles segmented control (`1× / 2× / 3×`), gated on `shape.hasCycles`.

Note the resulting layout: a descent shows **Element enabled, Size greyed, Cycles enabled**, which reads oddly — a disabled control sitting between two live ones. Since no shape ever has both Size and Cycles, the cleaner treatment is to render **whichever axis the shape actually has** in that row and omit the other entirely, rather than greying one out. Take that approach; the greyed-Size convention stays for shapes (specials, sheets) that genuinely have neither.

## Testing

Both repos gate on `tsc`; eoweb adds `biome`; assertions ride `scripts/vfx-registry-check.ts`.

- **449 names / 35 shapes**, all unique, round-trip `compose(decompose(name)) === name` for every one — including the new `-x2`/`-x3` names.
- **No cycles leak:** `ring-of-fire-<element>-x2` must not exist; `hasCycles` false for `ring-of-fire`, true for the three descents, false for every matrix kind, combo and special.
- **No size leak** still holds: no `<setpiece>-<element>-sm|lg`.
- `composeVfxName` ignores `cycles` for shapes without the axis and `size` for set pieces; malformed and prototype-key inputs still return `null`.
- **Every `SQUARE_FRAME` def still has `bodyLift: true`**, `TALL_FRAME` and `GROUND_FRAME` false — the guard against a future preset silently inheriting the wrong anchoring.
- Determinism unchanged; per-axis integer scaling unchanged.
- Cross-repo parity passes after re-sync.
- **Manual (browser + game):** descents visibly repeat at `-x2`/`-x3` and the first impact still lands with the damage number; ring of fire sits on the ground, flames read as flames, and the centre fill is *under* the NPC; all three boulders land; no existing effect moved.

## Risks

- **`bodyLift` touches every effect's on-screen position.** Getting the flag wrong on `SQUARE_FRAME` or on `buildSheet` shifts all 379 legacy effects and both sheets by 20px. This is the highest-risk change here and needs an explicit before/after position check, not just a type check.
- **`composeVfxName`'s signature grows a fourth parameter.** Positional arguments are easy to misalign; the round-trip assertion over all 449 names is what catches it.
- **Looping a descent may read as a stutter rather than waves** if the loop point is visible — a rock landing and instantly reappearing at the top. The manual pass must judge this specifically at `-x3`.
- Ring of fire's taller tongues could exceed the 62px budget; measure rather than assume.

## Scope / YAGNI

**In:** the cycles axis and its editor control; explicit `bodyLift`; ring-of-fire ground anchoring, tongues and centre fill; rockfall's third landing.

**Out:** cycle counts above 3; a cycles axis on matrix kinds, combos, specials or `ring-of-fire`; any server-side per-skill VFX field; re-authoring `bolt` or `smite`; a standing automated extent gate (still a known, accepted gap); sound.
