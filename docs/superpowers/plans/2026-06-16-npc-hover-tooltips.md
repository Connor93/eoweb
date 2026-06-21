# NPC Hover Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-line sprite NPC name-on-hover with a DOM tooltip showing Name / Lvl / damage-type / weakness-type for combat NPCs (name only for non-combat), built as the extension seam for future per-instance NPC affixes and a future player tooltip.

**Architecture:** The eoweb client already has every field except a usable NPC level — the synced eolib ENF record carries `name`, `element`, `elementWeakness`. The server fix injects the real per-NPC level (`NPC_RATES_DB`) into each ENF record at the single client-bound serialization point, so `record.level` becomes correct with no new packet. The client adds a `hoveredNpcIndex` hover state (mirroring `hoveredItemUid`), a new `<NpcTooltip>` Preact overlay modeled on `<GroundItemTooltip>`, and removes the NPC branch of the sprite nameplate.

**Tech Stack:** Rust (REOSERV, tokio actors, eolib pub serialization, `cargo test --bin reoserv`); TypeScript / Preact / Pixi (eoweb, no unit-test runner — verify via `pnpm exec tsc --noEmit` + `pnpm lint` + running the app).

**Spans two repos:** Task 1 is in `/Users/cfraser/Projects/reoserv`. Tasks 2–4 are in `/Users/cfraser/Projects/eoweb`. Task 5 verifies both together. The two repos must be deployed together (the client only shows correct levels once the server injects them), same coupling as prior cross-repo slices.

**Before you start:** Both repos are currently on `master`. Create a feature branch in each before committing:
- reoserv: `git -C /Users/cfraser/Projects/reoserv switch -c feat/npc-hover-level`
- eoweb: `git -C /Users/cfraser/Projects/eoweb switch -c feat/npc-hover-tooltip`

---

## Task 1: Inject NPC level into the client-bound ENF (REOSERV)

The on-disk ENF `level` field is a stub the server ignores at runtime (combat uses `NPC_RATES_DB`). The client reads `record.level` off the synced ENF for the hover tooltip, so we inject the real level at the one place the ENF is serialized for clients — `build_pub_file_packet(FileType::Enf)`, shared by both the login file-request path and the hot-reload broadcast. A pub edit reloads both `NPC_DB` and `NPC_RATES_DB` and re-pushes the ENF, so hot-reload is automatically covered.

**Files:**
- Modify: `/Users/cfraser/Projects/reoserv/src/utils/build_pub_file_packet.rs`

- [ ] **Step 1: Write the failing test**

Add this test to the existing `#[cfg(test)] mod tests` block in `src/utils/build_pub_file_packet.rs` (after the existing `builds_client_pub_packets_and_rejects_others` test, inside the same `mod tests`):

```rust
    #[test]
    fn injects_rates_level_into_every_enf_record() {
        let enf = enf_with_injected_levels(&crate::NPC_DB.load(), &crate::NPC_RATES_DB.load());
        let rates = crate::NPC_RATES_DB.load();
        // Every record's level must equal the per-NPC rates level (ids are
        // 1-based). This is the value the eoweb hover tooltip reads.
        for (i, record) in enf.npcs.iter().enumerate() {
            assert_eq!(record.level, rates.get(i as i32 + 1).level);
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --bin reoserv injects_rates_level_into_every_enf_record`
Expected: FAIL — compile error `cannot find function 'enf_with_injected_levels' in this scope`.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/build_pub_file_packet.rs`, extend the eolib import to bring in `Enf` (line 1–12 block). Change:

```rust
use eolib::{
    data::{EoSerialize, EoWriter},
    protocol::net::{
        client::FileType,
        server::{
            InitInitServerPacket, InitInitServerPacketReplyCodeData,
            InitInitServerPacketReplyCodeDataFileEcf, InitInitServerPacketReplyCodeDataFileEif,
            InitInitServerPacketReplyCodeDataFileEnf, InitInitServerPacketReplyCodeDataFileEsf,
            InitReply, PubFile,
        },
    },
};

use crate::{CLASS_DB, ITEM_DB, NPC_DB, SPELL_DB};
```

to:

```rust
use eolib::{
    data::{EoSerialize, EoWriter},
    protocol::{
        net::{
            client::FileType,
            server::{
                InitInitServerPacket, InitInitServerPacketReplyCodeData,
                InitInitServerPacketReplyCodeDataFileEcf, InitInitServerPacketReplyCodeDataFileEif,
                InitInitServerPacketReplyCodeDataFileEnf, InitInitServerPacketReplyCodeDataFileEsf,
                InitReply, PubFile,
            },
        },
        r#pub::Enf,
    },
};

use crate::{CLASS_DB, ITEM_DB, NPC_DB, NPC_RATES_DB, SPELL_DB, utils::NpcRatesMap};
```

Replace the `FileType::Enf` arm (currently lines 42–60) so it serializes the level-injected copy:

```rust
        FileType::Enf => {
            let enf = enf_with_injected_levels(&NPC_DB.load(), &NPC_RATES_DB.load());
            let mut writer = EoWriter::new();
            if let Err(e) = enf.serialize(&mut writer) {
                tracing::error!("Failed to serialize enf pub file: {}", e);
                return None;
            }
            InitInitServerPacket {
                reply_code: InitReply::FileEnf,
                reply_code_data: Some(InitInitServerPacketReplyCodeData::FileEnf(
                    InitInitServerPacketReplyCodeDataFileEnf {
                        pub_file: PubFile {
                            file_id: 1, // TODO: Pub splitting
                            content: writer.to_byte_array().to_vec(),
                        },
                    },
                )),
            }
        }
```

Add the helper function immediately after the `build_pub_file_packet` function (after its closing `}` near line 101, before the `#[cfg(test)]` block):

```rust
/// Return a copy of the NPC pub with each record's `level` set from the
/// per-NPC rates. The on-disk ENF `level` is a stub the server ignores at
/// runtime (combat reads `NPC_RATES_DB`), but the eoweb client reads
/// `record.level` off the synced ENF to show the hover tooltip — so we
/// inject the real level here, at the one client-bound serialization point.
/// NPC ids are 1-based; `rates.get` yields a default (level 1) for any id
/// without an explicit rates entry. Takes `&Enf` and clones, so the shared
/// global is never mutated.
fn enf_with_injected_levels(enf: &Enf, rates: &NpcRatesMap) -> Enf {
    let mut out = enf.clone();
    for (i, record) in out.npcs.iter_mut().enumerate() {
        record.level = rates.get(i as i32 + 1).level;
    }
    out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --bin reoserv injects_rates_level_into_every_enf_record`
Expected: PASS (1 passed). Also run `cargo test --bin reoserv build_pub` to confirm the pre-existing `builds_client_pub_packets_and_rejects_others` still passes.

- [ ] **Step 5: Format, lint, build**

Run:
```bash
cargo fmt
cargo clippy --bin reoserv 2>&1 | tail -20
cargo build --bin reoserv 2>&1 | tail -5
```
Expected: `cargo fmt` no output; clippy no new warnings on the changed file; build succeeds.

- [ ] **Step 6: Commit**

```bash
git -C /Users/cfraser/Projects/reoserv add src/utils/build_pub_file_packet.rs
git -C /Users/cfraser/Projects/reoserv commit -m "feat(npc): inject per-NPC rates level into client-bound ENF

The on-disk ENF level is a stub; inject NPC_RATES_DB.level into each
record at the single client-bound serialization point so eoweb can show
NPC level on hover. No new packet; hot-reload re-pushes automatically.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `hoveredNpcIndex` hover state + mouse wiring (eoweb)

Mirror the existing `hoveredItemUid` ground-item hover state for NPCs. This task adds the state field and updates it from the mouse handlers; nothing renders yet (the tooltip is Task 3), so the only verification is a clean typecheck/lint.

**Files:**
- Modify: `/Users/cfraser/Projects/eoweb/src/client/client.ts` (near line 190)
- Modify: `/Users/cfraser/Projects/eoweb/src/controllers/mouse-controller.ts`

- [ ] **Step 1: Add the hover-state field to Client**

In `src/client/client.ts`, find (line 190):

```typescript
  hoveredItemUid: number | null = null;
```

Add directly below it:

```typescript
  // NPC index (instance index, matches getNpcByIndex) currently under the
  // cursor — drives the <NpcTooltip> overlay. Null when no NPC is hovered.
  hoveredNpcIndex: number | null = null;
```

- [ ] **Step 2: Resolve the hovered NPC in the mousemove handler**

In `src/controllers/mouse-controller.ts`, the `mousemove` listener (starts line 132) sets `mousePosition`, then has a block beginning `const mc = this.client.mouseCoords;` (line 152). Insert NPC resolution **immediately before** that `const mc` line:

```typescript
      // Resolve the NPC under the cursor (pixel-space hit rects) to drive the
      // NPC hover tooltip. Suppressed over UI panels, same as item hover.
      if (isInUI(e.target)) {
        this.client.hoveredNpcIndex = null;
      } else {
        const npcAt = getNpcIntersecting(this.client.mousePosition!);
        this.client.hoveredNpcIndex = npcAt ? npcAt.id : null;
      }
```

(`getNpcIntersecting` is already imported at the top of this file; `npcAt.id` is the NPC instance index.)

- [ ] **Step 3: Clear the NPC hover state in the existing clear sites**

There are three other places that clear `hoveredItemUid`. Add the matching NPC clear to each.

In the `touchend` listener (line 109), find:

```typescript
        // Finger lifted — clear the hover tooltip regardless of gesture type.
        this.client.hoveredItemUid = null;
```

Replace with:

```typescript
        // Finger lifted — clear the hover tooltip regardless of gesture type.
        this.client.hoveredItemUid = null;
        this.client.hoveredNpcIndex = null;
```

In the `touchcancel` listener (line 126–130), find:

```typescript
    window.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
      isLongPress = false;
      this.client.hoveredItemUid = null;
    });
```

Replace with:

```typescript
    window.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
      isLongPress = false;
      this.client.hoveredItemUid = null;
      this.client.hoveredNpcIndex = null;
    });
```

In the `mouseout` listener (line 174–178), find:

```typescript
    window.addEventListener('mouseout', (e) => {
      if (e.relatedTarget === null) {
        this.client.hoveredItemUid = null;
      }
    });
```

Replace with:

```typescript
    window.addEventListener('mouseout', (e) => {
      if (e.relatedTarget === null) {
        this.client.hoveredItemUid = null;
        this.client.hoveredNpcIndex = null;
      }
    });
```

- [ ] **Step 4: Typecheck and lint**

Run:
```bash
cd /Users/cfraser/Projects/eoweb && pnpm exec tsc --noEmit
cd /Users/cfraser/Projects/eoweb && pnpm lint
```
Expected: both clean (no errors). `hoveredNpcIndex` is now read nowhere yet — that's fine, it's a public field, not a local, so no unused-variable error.

- [ ] **Step 5: Commit**

```bash
git -C /Users/cfraser/Projects/eoweb add src/client/client.ts src/controllers/mouse-controller.ts
git -C /Users/cfraser/Projects/eoweb commit -m "feat(npc): track hoveredNpcIndex for the NPC hover tooltip

Mirror hoveredItemUid: resolve the NPC under the cursor on mousemove and
clear it on touchend/touchcancel/mouseout. Drives the upcoming overlay.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create the `<NpcTooltip>` component + model builder (eoweb)

A new Preact overlay modeled on `GroundItemTooltip`. A pure `buildNpcTooltipModel` turns an ENF record into a display model: combat NPCs (Passive/Aggressive) get level + a damage-type badge + a weakness badge (only when present); non-combat NPCs get name only. The `badges` array is the extension seam for future per-instance affixes. This task creates and exports the component but does not mount it yet (Task 4), so verification is typecheck/lint only.

**Files:**
- Create: `/Users/cfraser/Projects/eoweb/src/ui/in-game/npc-tooltip.tsx`
- Modify: `/Users/cfraser/Projects/eoweb/src/ui/in-game/index.ts`

- [ ] **Step 1: Create the component file**

Create `/Users/cfraser/Projects/eoweb/src/ui/in-game/npc-tooltip.tsx` with exactly:

```tsx
import { Element, type EnfRecord, NpcType } from 'eolib';
import { useEffect, useState } from 'preact/hooks';
import {
  CombatElement,
  combatElementColor,
  combatElementLabel,
} from '@/combat-overlay';
import { eolibToCombatElement } from '@/combat-overlay/element-colors';
import { useClient } from '@/ui/context';
import { isoToScreen } from '@/utils';

// A single colored badge row in an entity tooltip — a damage type, a
// weakness, and (in a later slice) per-instance affixes. Kept generic so a
// future player tooltip can reuse the same shape.
export interface TooltipBadge {
  label: string;
  color: string;
}

// Display model for the NPC hover tooltip. `level` and `badges` are only
// populated for combat NPCs; non-combat NPCs carry just `name`.
export interface NpcTooltipModel {
  name: string;
  level?: number;
  badges: TooltipBadge[];
}

const COMBAT_NPC_TYPES = new Set<NpcType>([
  NpcType.Passive,
  NpcType.Aggressive,
]);

/** Build the tooltip display model from an NPC's ENF record. Combat NPCs
 *  show level + a damage-type badge (None renders as "Plain") and, when the
 *  NPC has one, a weakness badge. Non-combat NPCs show name only. The
 *  `badges` array is the extension seam: future per-instance affixes append
 *  here, and a future player tooltip reuses this model shape. */
export function buildNpcTooltipModel(record: EnfRecord): NpcTooltipModel {
  if (!COMBAT_NPC_TYPES.has(record.type)) {
    return { name: record.name, badges: [] };
  }

  const badges: TooltipBadge[] = [];

  // Damage type — always shown for combat NPCs.
  const damage = eolibToCombatElement(record.element);
  badges.push({
    label: combatElementLabel(damage),
    color: combatElementColor(damage),
  });

  // Weakness — only when the NPC actually has one.
  if (record.elementWeakness !== Element.None) {
    const weakness = eolibToCombatElement(record.elementWeakness);
    badges.push({
      label: `Weak: ${combatElementLabel(weakness)}`,
      color: combatElementColor(weakness),
    });
  }

  return { name: record.name, level: record.level, badges };
}

/** Vertical pixels (logical canvas coords) added on top of the per-NPC
 *  nameLabelOffset to float the tooltip above the NPC's head. ~one tile;
 *  approximates the old sprite nameplate anchor (TILE_HEIGHT - 4). */
const TOOLTIP_BASE_UP = 28;

export function NpcTooltip() {
  const client = useClient();
  const [, force] = useState(0);

  // Re-render every frame so the tooltip tracks the camera as the player
  // walks — same pattern as GroundItemTooltip / CombatOverlay.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((n) => (n + 1) % 65536);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client]);

  const index = client.hoveredNpcIndex;
  if (index === null) return null;

  const npc = client.getNpcByIndex(index);
  if (!npc) return null;

  const record = client.getEnfRecordById(npc.id);
  if (!record) return null;

  const model = buildNpcTooltipModel(record);

  const cameraX = client.mapRenderer?.lastPlayerScreen?.x ?? 0;
  const cameraY = client.mapRenderer?.lastPlayerScreen?.y ?? 0;
  const halfW = client.mapRenderer?.halfGameWidthPublic ?? 0;
  const halfH = client.mapRenderer?.halfGameHeightPublic ?? 0;
  const zoom = client.viewportController?.getZoom?.() ?? 1;

  const meta = client.getNpcMetadata(record.graphicId);
  const up = TOOLTIP_BASE_UP + meta.nameLabelOffset;

  const tileScreen = isoToScreen(npc.coords);
  const x = Math.floor(tileScreen.x - cameraX + halfW);
  const y = Math.floor(tileScreen.y - cameraY + halfH - up);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
        pointerEvents: 'none',
        zIndex: 9998,
      }}
    >
      <div style={{ position: 'absolute', left: `${x}px`, top: `${y}px` }}>
        <div
          class='w-max max-w-56 rounded bg-base-300 px-2 py-1 text-center text-xs shadow-lg'
          // scale(0.45): the panel already rides the wrapper's scale(zoom);
          // this sets its on-screen size, matching GroundItemTooltip.
          style={{
            transform: 'translate(-50%, -100%) scale(0.45)',
            transformOrigin: 'center bottom',
          }}
        >
          <div class='font-semibold'>{model.name}</div>
          {model.level !== undefined && (
            <div class='opacity-70'>Lvl {model.level}</div>
          )}
          {model.badges.map((b, i) => (
            <div key={i} style={{ color: b.color, fontSize: '11px' }}>
              {b.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Note on the `CombatElement` import: it is imported for type symmetry with the rest of the combat-overlay API and to keep the module self-documenting. If `pnpm lint` flags it as unused, drop `CombatElement` from the import — the component still compiles, since `combatElementLabel`/`combatElementColor`/`eolibToCombatElement` carry the typing.

- [ ] **Step 2: Export the component from the in-game barrel**

In `/Users/cfraser/Projects/eoweb/src/ui/in-game/index.ts`, find (line 36):

```typescript
export { GroundItemTooltip } from './ground-item-tooltip';
```

Add directly below it:

```typescript
export { NpcTooltip } from './npc-tooltip';
```

- [ ] **Step 3: Typecheck and lint**

Run:
```bash
cd /Users/cfraser/Projects/eoweb && pnpm exec tsc --noEmit
cd /Users/cfraser/Projects/eoweb && pnpm lint
```
Expected: clean. If lint flags `CombatElement` as an unused import, apply the note from Step 1 and re-run.

- [ ] **Step 4: Commit**

```bash
git -C /Users/cfraser/Projects/eoweb add src/ui/in-game/npc-tooltip.tsx src/ui/in-game/index.ts
git -C /Users/cfraser/Projects/eoweb commit -m "feat(npc): add NpcTooltip overlay + model builder

DOM tooltip modeled on GroundItemTooltip. buildNpcTooltipModel: combat
NPCs show level + damage badge + weakness badge (when present); non-combat
show name only. badges[] is the seam for future affixes / player tooltip.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Mount the tooltip + remove the old sprite NPC nameplate (eoweb)

Wire `<NpcTooltip>` into the in-game overlay tree and delete the NPC branch of the sprite nameplate so the name isn't rendered twice. This is the task that produces visible behavior.

**Files:**
- Modify: `/Users/cfraser/Projects/eoweb/src/ui/containers/in-game.tsx`
- Modify: `/Users/cfraser/Projects/eoweb/src/map.ts`

- [ ] **Step 1: Import and mount the tooltip**

In `/Users/cfraser/Projects/eoweb/src/ui/containers/in-game.tsx`, the import from `@/ui/in-game` (around line 28) includes `GroundItemTooltip,`. Add `NpcTooltip,` to that same import list (alphabetical or adjacent is fine), e.g.:

```typescript
  GroundItemTooltip,
  NpcTooltip,
```

Then find the render site (line 314):

```tsx
      <GroundItemTooltip />
```

Add directly below it:

```tsx
      <NpcTooltip />
```

- [ ] **Step 2: Remove the NPC branch of the sprite nameplate**

In `/Users/cfraser/Projects/eoweb/src/map.ts`, inside `addNameplateSprites`, delete the entire NPC resolution block and the now-stale comment. Find (lines 1925–1971):

```typescript
    if (!name) {
      const npcRect = getNpcIntersecting(this.client.mousePosition);
      if (npcRect) {
        const npc = this.client.getNpcByIndex(npcRect.id);
        const bubble =
          npc && !!this.client.animationController.npcChats.get(npc.index);
        let animation =
          npc && this.client.animationController.npcAnimations.get(npc.index);
        let dying = false;

        if (animation instanceof NpcDeathAnimation) {
          dying = true;
          if (animation.base) animation = animation.base;
        }

        if (!bubble && !(animation instanceof NpcDeathAnimation) && npc) {
          const record = this.client.getEnfRecordById(npc.id);
          if (record) {
            name = record.name;
            coords.x = npc.coords.x;
            coords.y = npc.coords.y;
            offset.y -= TILE_HEIGHT;

            const meta = this.client.getNpcMetadata(record.graphicId);
            if (meta) {
              offset.y -= meta.nameLabelOffset - 4;
            }

            if (animation instanceof NpcWalkAnimation) {
              const walkOffset = dying
                ? WALK_OFFSETS[animation.animationFrame][animation.direction]
                : this.interpolateWalkOffset(
                    animation.animationFrame,
                    animation.direction,
                  );
              offset.x += walkOffset.x;
              offset.y += walkOffset.y;
              coords.x = animation.from.x;
              coords.y = animation.from.y;
            }
          }
        }
      }
    }

    // (Ground-item name labels removed — the rich GroundItemTooltip replaces
    // them. Character/NPC nameplates above still apply; pickup is unaffected.)
```

Replace that whole span with just:

```typescript
    // NPC name labels moved to the DOM <NpcTooltip> overlay (combat NPCs show
    // name/level/element there). Ground-item labels likewise live in
    // <GroundItemTooltip>. Only character nameplates remain on this sprite
    // path; chat bubbles and pickup are unaffected.
```

This keeps the character branch (above) and the `if (!name) return;` + sprite-render code (below) intact — the nameplate now fires for characters only.

- [ ] **Step 3: Remove the now-unused import**

After Step 2, `getNpcIntersecting` is no longer used in `map.ts` (it was used only in the deleted block). In `src/map.ts`, find the import line (line 21):

```typescript
  getNpcIntersecting,
```

Delete that single line. (`NpcDeathAnimation`, `NpcWalkAnimation`, `WALK_OFFSETS`, `TILE_HEIGHT`, and `interpolateWalkOffset` are all still used elsewhere in the file — keep them.)

- [ ] **Step 4: Typecheck and lint**

Run:
```bash
cd /Users/cfraser/Projects/eoweb && pnpm exec tsc --noEmit
cd /Users/cfraser/Projects/eoweb && pnpm lint
```
Expected: clean. If lint/tsc reports any *other* unused import in `map.ts`, remove exactly what it names (the analysis says only `getNpcIntersecting` should be affected).

- [ ] **Step 5: Commit**

```bash
git -C /Users/cfraser/Projects/eoweb add src/ui/containers/in-game.tsx src/map.ts
git -C /Users/cfraser/Projects/eoweb commit -m "feat(npc): mount NpcTooltip, remove sprite NPC nameplate

Wire <NpcTooltip> into the in-game overlay and delete the NPC branch of
addNameplateSprites (now redundant). Character nameplates and chat bubbles
unaffected.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: End-to-end verification (both repos)

No automated tests cover the rendered hover — verify by running the server and client together. The git status shows `data/pub/items/0593.json` already modified; that is unrelated (a prior play-test weapon) — leave it.

**Files:** none (manual verification)

- [ ] **Step 1: Temporarily author an element + weakness on one combat NPC**

So the colored badges are observable (all NPCs currently ship `element: 0`). Edit a low-level combat NPC pub, e.g. `/Users/cfraser/Projects/reoserv/data/pub/npcs/0001.json` (Crow, `type: 1` = Passive), and set:

```json
  "element": 6,
  "element_weakness": 1,
```

(eolib element ids: 1=Light, 2=Dark, 3=Earth, 4=Wind, 5=Water, 6=Fire — so this makes the Crow deal "Fire" and be weak to "Light"; the client's `eolibToCombatElement` remaps the ordering. Pick any non-zero values.) Also confirm the Crow has a non-default level via its rates (`level` field in the same JSON, e.g. `"level": 3`).

- [ ] **Step 2: Run the server**

```bash
cd /Users/cfraser/Projects/reoserv && cargo run 2>&1 | tee /tmp/reoserv-npc-hover.log
```
Expected: server boots; on the NPC pub edit you should see a `Pushed Enf pub reload to N in-game player(s)` line if a client is already connected (hot-reload).

- [ ] **Step 3: Run the client**

```bash
cd /Users/cfraser/Projects/eoweb && pnpm dev
```
Open the client, log in, and walk to a map with NPCs.

- [ ] **Step 4: Verify the behavior**

Confirm each:
- Hover the edited Crow → DOM tooltip shows **Crow**, **Lvl 3**, a colored **Fire** badge, and a colored **Weak: Light** badge.
- Hover an unedited combat NPC → tooltip shows name, level, and a **Plain** damage badge, with **no weakness line**.
- Hover a non-combat NPC (shop/quest giver) → tooltip shows **name only** (no level/element).
- The old single-line sprite NPC name no longer appears (no doubled name).
- Character (player) nameplates still appear on hover, unchanged.
- NPC chat bubbles still appear, unchanged.
- With a client connected, edit the Crow's `level` in its JSON and save → the hovered tooltip's level updates within a couple seconds (hot-reload), no refresh.

- [ ] **Step 5: Revert the temporary NPC edit**

Restore the test NPC pub so the element/weakness/level change isn't committed as content (unless you intend to keep it):

```bash
git -C /Users/cfraser/Projects/reoserv checkout -- data/pub/npcs/0001.json
```

(If you set a level you want to keep, leave it — but the element/weakness were only for the visual check.)

---

## Self-Review

**Spec coverage** (against `Web Client/Documentation/Planning/NPC hover tooltips.md`):
- D1 (level folds into ENF sync) → Task 1.
- D2 (damage always, weakness only when present) → `buildNpcTooltipModel`, Task 3 Step 1.
- D3 (unify all NPCs onto DOM tooltip; remove old nameplate) → Tasks 3–4.
- D4 (extensible badge row; no premature `<EntityTooltip>` extraction) → `TooltipBadge`/`badges[]` in Task 3.
- Non-combat = name only → `COMBAT_NPC_TYPES` gate in Task 3.
- Hover tracking mirrors `hoveredItemUid` → Task 2.
- Verification (run it; hot-reload updates level) → Task 5.

**Placeholder scan:** none — every step has concrete code or an exact command.

**Type consistency:** `hoveredNpcIndex` (Client field) is read in Task 3; `buildNpcTooltipModel(record: EnfRecord)` consumes the eolib `EnfRecord` returned by `getEnfRecordById`; `NpcTooltipModel.badges: TooltipBadge[]` matches the render loop; `enf_with_injected_levels(&Enf, &NpcRatesMap) -> Enf` matches its call site and test. `npcAt.id` is the NPC instance index, consumed by `getNpcByIndex`.
