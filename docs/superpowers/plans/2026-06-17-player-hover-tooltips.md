# Player Hover Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering a player shows a DOM tooltip with Name / Lvl / Class / Guild-tag, replacing the old sprite nameplate — reusing a shared `<EntityTooltip>` extracted from the just-built NPC tooltip.

**Architecture:** Client-only (every field is already on the synced `CharacterMapInfo`). Extract a presentational `<EntityTooltip>` + `EntityTooltipModel`/`TooltipRow` + a `useTooltipFrame()` hook, refactor `<NpcTooltip>` onto it, then add a `<PlayerTooltip>` container + `hoveredCharacterId` hover state. Finally delete the now-redundant `addNameplateSprites`.

**Tech Stack:** TypeScript / Preact / Pixi (eoweb). No unit-test runner — verify via `pnpm exec tsc --noEmit` + per-file `pnpm exec biome check` + running the app. **Package manager: pnpm.** A lefthook pre-commit hook runs biome + tsc on staged files.

**Where it lives:** eoweb only, continuing on the existing branch **`feat/npc-hover-tooltip`** (current HEAD `fa6709d`) — it refactors `npc-tooltip.tsx`, so it builds on that unmerged work and ships with it. **No reoserv change.**

**Conventions for every task:**
- Use EXACT explicit paths in `git add` (never `git add .`/`-A`) — an untracked plan doc under `docs/superpowers/plans/` must NOT be committed.
- The full-repo `pnpm lint` has PRE-EXISTING failures in unrelated files; verify only YOUR files with `pnpm exec biome check <files>`. `pnpm exec tsc --noEmit` checks the whole project (must be clean).
- End commit messages with the `Co-Authored-By` trailer shown in each task.

---

## Task 1: Extract shared `<EntityTooltip>` and refactor `<NpcTooltip>` onto it

Pure refactor — the NPC tooltip's rendered output is unchanged; we move the render shell, model types, and RAF loop into a shared module so the player tooltip can reuse them.

**Files:**
- Create: `/Users/cfraser/Projects/eoweb/src/ui/in-game/entity-tooltip.tsx`
- Modify (replace contents): `/Users/cfraser/Projects/eoweb/src/ui/in-game/npc-tooltip.tsx`

- [ ] **Step 1: Create the shared module**

Create `/Users/cfraser/Projects/eoweb/src/ui/in-game/entity-tooltip.tsx` with exactly:

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { Client } from '@/client';

// One row under the name in an entity tooltip. `color` set → a colored line
// (e.g. an NPC element badge); omitted → muted default text (e.g. a player's
// class / guild).
export interface TooltipRow {
  text: string;
  color?: string;
}

// Shared display model for entity hover tooltips (NPCs, players). `level` and
// `rows` are optional content rendered under the name.
export interface EntityTooltipModel {
  name: string;
  level?: number;
  rows: TooltipRow[];
}

/** Re-render every animation frame so a tooltip tracks the camera / sprite as
 *  things move — shared by the NPC and player tooltips (same pattern as
 *  GroundItemTooltip / CombatOverlay). */
export function useTooltipFrame(client: Client): void {
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((n) => (n + 1) % 65536);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client]);
}

/** Presentational entity tooltip: renders the zoom wrapper + bubble at the
 *  given screen position. Position and model are computed by the caller (the
 *  per-entity container component). */
export function EntityTooltip({
  x,
  y,
  zoom,
  model,
}: {
  x: number;
  y: number;
  zoom: number;
  model: EntityTooltipModel;
}) {
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
          style={{
            transform: 'translate(-50%, -100%) scale(0.45)',
            transformOrigin: 'center bottom',
          }}
        >
          <div class='font-semibold'>{model.name}</div>
          {model.level !== undefined && (
            <div class='opacity-70'>Lvl {model.level}</div>
          )}
          {model.rows.map((r, i) =>
            r.color ? (
              <div key={i} style={{ color: r.color, fontSize: '11px' }}>
                {r.text}
              </div>
            ) : (
              <div key={i} class='opacity-70'>
                {r.text}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the NPC tooltip with the refactored version**

Replace the ENTIRE contents of `/Users/cfraser/Projects/eoweb/src/ui/in-game/npc-tooltip.tsx` with exactly:

```tsx
import { Element, type EnfRecord, NpcType } from 'eolib';
import { combatElementColor, combatElementLabel } from '@/combat-overlay';
import { eolibToCombatElement } from '@/combat-overlay/element-colors';
import { NpcDeathAnimation } from '@/render';
import { useClient } from '@/ui/context';
import {
  EntityTooltip,
  type EntityTooltipModel,
  type TooltipRow,
  useTooltipFrame,
} from './entity-tooltip';

const COMBAT_NPC_TYPES = new Set<NpcType>([
  NpcType.Passive,
  NpcType.Aggressive,
]);

/** Build the tooltip model from an NPC's ENF record. Combat NPCs show level +
 *  a damage-type row (None renders as "Plain") and, when the NPC has one, a
 *  weakness row. Non-combat NPCs show name only. Rows are colored element
 *  badges; future per-instance affixes append here. */
export function buildNpcTooltipModel(record: EnfRecord): EntityTooltipModel {
  if (!COMBAT_NPC_TYPES.has(record.type)) {
    return { name: record.name, rows: [] };
  }

  const rows: TooltipRow[] = [];

  // Damage type — always shown for combat NPCs.
  const damage = eolibToCombatElement(record.element);
  rows.push({
    text: combatElementLabel(damage),
    color: combatElementColor(damage),
  });

  // Weakness — only when the NPC actually has one.
  if (record.elementWeakness !== Element.None) {
    const weakness = eolibToCombatElement(record.elementWeakness);
    rows.push({
      text: `Weak: ${combatElementLabel(weakness)}`,
      color: combatElementColor(weakness),
    });
  }

  return { name: record.name, level: record.level, rows };
}

/** Vertical pixels (logical canvas coords) added on top of the per-NPC
 *  nameLabelOffset to float the tooltip above the NPC's head. ~one tile. */
const TOOLTIP_BASE_UP = 28;

export function NpcTooltip() {
  const client = useClient();
  useTooltipFrame(client);

  const index = client.hoveredNpcIndex;
  if (index === null) return null;

  const npc = client.getNpcByIndex(index);
  if (!npc) return null;

  const record = client.getEnfRecordById(npc.id);
  if (!record) return null;

  // Match the old sprite nameplate: suppress while the NPC is dying or while
  // a chat bubble is showing (the bubble would otherwise overlap the tooltip).
  if (client.animationController.npcChats.get(index)) return null;
  const animation = client.animationController.npcAnimations.get(index);
  if (animation instanceof NpcDeathAnimation) return null;

  const model = buildNpcTooltipModel(record);

  const cameraX = client.mapRenderer?.lastPlayerScreen?.x ?? 0;
  const cameraY = client.mapRenderer?.lastPlayerScreen?.y ?? 0;
  const halfW = client.mapRenderer?.halfGameWidthPublic ?? 0;
  const halfH = client.mapRenderer?.halfGameHeightPublic ?? 0;
  const zoom = client.viewportController?.getZoom?.() ?? 1;

  const meta = client.getNpcMetadata(record.graphicId);
  const up = TOOLTIP_BASE_UP + meta.nameLabelOffset;

  // Smooth-follow the NPC sprite (incl. walk interpolation) via the shared
  // map-renderer helper that CombatOverlay's HP bars use.
  const liveScreen =
    client.mapRenderer?.getEntityIsoScreenPosition(`npc:${index}`) ?? null;
  if (!liveScreen) return null;

  const x = Math.floor(liveScreen.x - cameraX + halfW);
  const y = Math.floor(liveScreen.y - cameraY + halfH - up);

  return <EntityTooltip x={x} y={y} zoom={zoom} model={model} />;
}
```

Note: `TooltipBadge` / `NpcTooltipModel` are intentionally gone (replaced by `EntityTooltipModel` / `TooltipRow`). `buildNpcTooltipModel`'s return type changed to `EntityTooltipModel` and `badges` → `rows`, `label` → `text`. Nothing imports the old `TooltipBadge`/`NpcTooltipModel` types (they were only used inside this file).

- [ ] **Step 3: Typecheck and lint**

Run:
```bash
cd /Users/cfraser/Projects/eoweb && pnpm exec tsc --noEmit
cd /Users/cfraser/Projects/eoweb && pnpm exec biome check src/ui/in-game/entity-tooltip.tsx src/ui/in-game/npc-tooltip.tsx
```
Expected: tsc clean (whole project — this also proves nothing else imported the removed `TooltipBadge`/`NpcTooltipModel`); biome clean on the two files. If biome reorders imports, run `pnpm exec biome check --write` on the two files and re-verify.

- [ ] **Step 4: Commit**

```bash
git -C /Users/cfraser/Projects/eoweb add src/ui/in-game/entity-tooltip.tsx src/ui/in-game/npc-tooltip.tsx
git -C /Users/cfraser/Projects/eoweb commit -m "refactor(tooltip): extract shared EntityTooltip from NpcTooltip

Move the tooltip render shell, model types (EntityTooltipModel/TooltipRow),
and RAF hook into entity-tooltip.tsx; refactor NpcTooltip onto it. Rendered
output unchanged. Prepares the shared component for the player tooltip.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `hoveredCharacterId` hover state + mouse wiring

Mirror the existing `hoveredNpcIndex`. Nothing renders yet (the player tooltip is Task 3), so verification is a clean typecheck/lint.

**Files:**
- Modify: `/Users/cfraser/Projects/eoweb/src/client/client.ts` (after line 193)
- Modify: `/Users/cfraser/Projects/eoweb/src/controllers/mouse-controller.ts`

- [ ] **Step 1: Add the hover-state field to Client**

In `src/client/client.ts`, find (lines 191–193):

```typescript
  // NPC index (instance index, matches getNpcByIndex) currently under the
  // cursor — drives the <NpcTooltip> overlay. Null when no NPC is hovered.
  hoveredNpcIndex: number | null = null;
```

Add directly below it:

```typescript
  // Player id (matches getCharacterById) currently under the cursor — drives
  // the <PlayerTooltip> overlay. Null when no player is hovered.
  hoveredCharacterId: number | null = null;
```

- [ ] **Step 2: Resolve the hovered player in the mousemove handler**

In `src/controllers/mouse-controller.ts`, the `mousemove` listener has an NPC-resolution block that ends at line 157 (`}` closing the `else`). It looks like:

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

Immediately AFTER that block (before the `// Resolve the topmost ground item` comment), insert:

```typescript
      // Resolve the player under the cursor to drive the player hover tooltip.
      if (isInUI(e.target)) {
        this.client.hoveredCharacterId = null;
      } else {
        const charAt = getCharacterIntersecting(this.client.mousePosition!);
        this.client.hoveredCharacterId = charAt ? charAt.id : null;
      }
```

(`getCharacterIntersecting` is already imported at the top of this file; `charAt.id` is the player id.)

- [ ] **Step 3: Clear the player hover state in the three clear sites**

In the `touchend` listener, find:

```typescript
        this.client.hoveredItemUid = null;
        this.client.hoveredNpcIndex = null;
```

Replace with:

```typescript
        this.client.hoveredItemUid = null;
        this.client.hoveredNpcIndex = null;
        this.client.hoveredCharacterId = null;
```

In the `touchcancel` listener, find:

```typescript
      this.client.hoveredItemUid = null;
      this.client.hoveredNpcIndex = null;
    });
```

Replace with:

```typescript
      this.client.hoveredItemUid = null;
      this.client.hoveredNpcIndex = null;
      this.client.hoveredCharacterId = null;
    });
```

In the `mouseout` listener, find:

```typescript
        this.client.hoveredItemUid = null;
        this.client.hoveredNpcIndex = null;
      }
    });
```

Replace with:

```typescript
        this.client.hoveredItemUid = null;
        this.client.hoveredNpcIndex = null;
        this.client.hoveredCharacterId = null;
      }
    });
```

(There are three places that pair `hoveredItemUid` + `hoveredNpcIndex` clears: touchend, touchcancel, mouseout. The `replace_all` of the two-line `hoveredItemUid`/`hoveredNpcIndex` pair is unsafe because indentation differs — edit each of the three sites individually using the surrounding context shown above.)

- [ ] **Step 4: Typecheck and lint**

Run:
```bash
cd /Users/cfraser/Projects/eoweb && pnpm exec tsc --noEmit
cd /Users/cfraser/Projects/eoweb && pnpm exec biome check src/client/client.ts src/controllers/mouse-controller.ts
```
Expected: both clean. `hoveredCharacterId` is read nowhere yet — fine (public field).

- [ ] **Step 5: Commit**

```bash
git -C /Users/cfraser/Projects/eoweb add src/client/client.ts src/controllers/mouse-controller.ts
git -C /Users/cfraser/Projects/eoweb commit -m "feat(player): track hoveredCharacterId for the player hover tooltip

Mirror hoveredNpcIndex: resolve the player under the cursor on mousemove and
clear it on touchend/touchcancel/mouseout. Drives the upcoming overlay.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create `<PlayerTooltip>` + `buildPlayerTooltipModel`

The player container. Built but not mounted yet (Task 4), so verification is typecheck + per-file lint.

**Files:**
- Create: `/Users/cfraser/Projects/eoweb/src/ui/in-game/player-tooltip.tsx`
- Modify: `/Users/cfraser/Projects/eoweb/src/ui/in-game/index.ts`

- [ ] **Step 1: Create the component file**

Create `/Users/cfraser/Projects/eoweb/src/ui/in-game/player-tooltip.tsx` with exactly:

```tsx
import { AdminLevel, type CharacterMapInfo, SitState } from 'eolib';
import type { Client } from '@/client';
import { CharacterDeathAnimation, CharacterSpellChantAnimation } from '@/render';
import { useClient } from '@/ui/context';
import { capitalize } from '@/utils';
import {
  EntityTooltip,
  type EntityTooltipModel,
  type TooltipRow,
  useTooltipFrame,
} from './entity-tooltip';

/** Up-offset (logical canvas px) to float the tooltip above the player's
 *  head, by sit state — mirrors the old sprite nameplate's offsets. */
function sitUpOffset(sitState: SitState): number {
  switch (sitState) {
    case SitState.Floor:
      return 50;
    case SitState.Chair:
      return 56;
    default: // Stand
      return 72;
  }
}

/** Build the tooltip model for a player. Name + level always; class row when
 *  the ECF resolves a class name; guild row (the 3-char tag) when the player
 *  is in a guild. Rows are plain (uncolored) text. */
export function buildPlayerTooltipModel(
  character: CharacterMapInfo,
  client: Client,
): EntityTooltipModel {
  const rows: TooltipRow[] = [];

  const className = client.getEcfRecordById(character.classId)?.name;
  if (className) {
    rows.push({ text: className });
  }

  const guildTag = character.guildTag.trim();
  if (guildTag) {
    rows.push({ text: `Guild: ${guildTag}` });
  }

  return {
    name: capitalize(character.name),
    level: character.level,
    rows,
  };
}

export function PlayerTooltip() {
  const client = useClient();
  useTooltipFrame(client);

  const id = client.hoveredCharacterId;
  if (id === null) return null;

  const character = client.getCharacterById(id);
  if (!character) return null;

  // Carry over the old sprite nameplate's guards: hide an invisible player
  // unless you're an admin, and suppress during chat bubble / death /
  // spell-chant (the bubble or animation would otherwise clash).
  if (character.invisible && client.admin === AdminLevel.Player) return null;
  if (client.animationController.characterChats.get(id)) return null;
  const animation = client.animationController.characterAnimations.get(id);
  if (
    animation instanceof CharacterDeathAnimation ||
    animation instanceof CharacterSpellChantAnimation
  ) {
    return null;
  }

  const model = buildPlayerTooltipModel(character, client);

  const cameraX = client.mapRenderer?.lastPlayerScreen?.x ?? 0;
  const cameraY = client.mapRenderer?.lastPlayerScreen?.y ?? 0;
  const halfW = client.mapRenderer?.halfGameWidthPublic ?? 0;
  const halfH = client.mapRenderer?.halfGameHeightPublic ?? 0;
  const zoom = client.viewportController?.getZoom?.() ?? 1;

  const up = sitUpOffset(character.sitState);

  // Smooth-follow the player sprite (incl. walk interpolation) via the shared
  // helper, same path the sprite is drawn with.
  const liveScreen =
    client.mapRenderer?.getEntityIsoScreenPosition(`char:${id}`) ?? null;
  if (!liveScreen) return null;

  const x = Math.floor(liveScreen.x - cameraX + halfW);
  const y = Math.floor(liveScreen.y - cameraY + halfH - up);

  return <EntityTooltip x={x} y={y} zoom={zoom} model={model} />;
}
```

Verify-as-you-go (read `npc-tooltip.tsx` + `client.ts` if unsure): `client.hoveredCharacterId` (Task 2), `client.getCharacterById(id)` → `CharacterMapInfo | undefined`, `client.getEcfRecordById(classId)` → `EcfRecord | undefined` (has `.name`), `client.admin`, `client.animationController.characterChats`/`characterAnimations`, and `getEntityIsoScreenPosition('char:<id>')` all exist and are used exactly this way in `map.ts` today. eolib `CharacterMapInfo` fields are camelCase: `name`, `level`, `classId`, `guildTag`, `invisible`, `sitState`.

- [ ] **Step 2: Export from the in-game barrel**

In `/Users/cfraser/Projects/eoweb/src/ui/in-game/index.ts`, find:

```typescript
export { NpcTooltip } from './npc-tooltip';
```

Add directly below it:

```typescript
export { PlayerTooltip } from './player-tooltip';
```

(Do NOT export `EntityTooltip` from the barrel — it's internal infra imported directly by the two tooltips. If biome re-sorts the export lines, accept its ordering.)

- [ ] **Step 3: Typecheck and lint**

Run:
```bash
cd /Users/cfraser/Projects/eoweb && pnpm exec tsc --noEmit
cd /Users/cfraser/Projects/eoweb && pnpm exec biome check src/ui/in-game/player-tooltip.tsx src/ui/in-game/index.ts
```
Expected: tsc clean; biome clean on the two files. If biome reorders imports/exports, run `pnpm exec biome check --write` on them and re-verify.

- [ ] **Step 4: Commit**

```bash
git -C /Users/cfraser/Projects/eoweb add src/ui/in-game/player-tooltip.tsx src/ui/in-game/index.ts
git -C /Users/cfraser/Projects/eoweb commit -m "feat(player): add PlayerTooltip overlay + model builder

Renders <EntityTooltip> from a player model: name, level, class (via ECF),
and the 3-char guild tag (when present). Carries over the old nameplate's
invisible/admin + chat/death/spell-chant suppression guards.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Mount `<PlayerTooltip>` + delete `addNameplateSprites`

Wire the tooltip in and remove the now-fully-redundant sprite nameplate (its NPC branch was already removed; the character branch is the last user).

**Files:**
- Modify: `/Users/cfraser/Projects/eoweb/src/ui/containers/in-game.tsx`
- Modify: `/Users/cfraser/Projects/eoweb/src/map.ts`

- [ ] **Step 1: Import and mount the tooltip**

In `/Users/cfraser/Projects/eoweb/src/ui/containers/in-game.tsx`, the import from `@/ui/in-game` (around line 40) includes `NpcTooltip,`. Add `PlayerTooltip,` to that same import list. Then find (around line 316):

```tsx
      <NpcTooltip />
```

Add directly below it:

```tsx
      <PlayerTooltip />
```

- [ ] **Step 2: Delete the call site**

In `/Users/cfraser/Projects/eoweb/src/map.ts`, find (line 855):

```typescript
    this.addNameplateSprites(playerScreen);
```

Delete that single line.

- [ ] **Step 3: Delete the `addNameplateSprites` method**

In `/Users/cfraser/Projects/eoweb/src/map.ts`, delete the entire method — from line 1858 `private addNameplateSprites(playerScreen: Vector2) {` through its closing brace at line 1952 (the `}` immediately before `private addChatBubbleSprites(`). The whole block to remove is:

```typescript
  private addNameplateSprites(playerScreen: Vector2) {
    if (!this.client.mousePosition) return;

    const coords = { x: 0, y: 0 };
    const offset = { x: 0, y: 0 };
    let name = '';
    const color = COLORS.Nameplate;
    const characterRect = getCharacterIntersecting(this.client.mousePosition);
    if (characterRect) {
      const character = this.client.getCharacterById(characterRect.id);
      const bubble =
        character &&
        !!this.client.animationController.characterChats.get(
          character.playerId,
        );
      let animation =
        character &&
        this.client.animationController.characterAnimations.get(
          character.playerId,
        );
      let dying = false;

      if (animation instanceof CharacterDeathAnimation) {
        dying = true;
        if (animation.base) animation = animation.base;
      }

      if (
        !bubble &&
        !(animation instanceof CharacterDeathAnimation) &&
        !(animation instanceof CharacterSpellChantAnimation) &&
        character &&
        (!character.invisible || this.client.admin !== AdminLevel.Player)
      ) {
        name = capitalize(character.name);
        coords.x = character.coords.x;
        coords.y = character.coords.y;

        switch (character.sitState) {
          case SitState.Floor:
            offset.y -= 50;
            break;
          case SitState.Chair:
            offset.y -= 56;
            break;
          case SitState.Stand:
            offset.y -= 72;
            break;
        }

        if (character.guildTag !== '   ') {
          name += ` ${character.guildTag}`;
        }

        if (animation instanceof CharacterWalkAnimation) {
          const walkOffset = dying
            ? WALK_OFFSETS[animation.animationFrame][animation.direction]
            : continuousWalkOffset(animation.progress, animation.direction);
          offset.x += walkOffset.x;
          offset.y += walkOffset.y;
          coords.x = animation.from.x;
          coords.y = animation.from.y;
        }
      }
    }

    // NPC name labels moved to the DOM <NpcTooltip> overlay (combat NPCs show
    // name/level/element there). Ground-item labels likewise live in
    // <GroundItemTooltip>. Only character nameplates remain on this sprite
    // path; chat bubbles and pickup are unaffected.

    if (!name) return;

    const positionX = (coords.x - coords.y) * HALF_TILE_WIDTH;
    const positionY = (coords.x + coords.y) * HALF_TILE_HEIGHT;
    const drawX = Math.floor(
      positionX - playerScreen.x + this._halfGameWidth + offset.x,
    );
    const drawY = Math.floor(
      positionY - playerScreen.y + this._halfGameHeight + offset.y,
    );

    this.addAtlasTextSprites(
      'ui:nameplate:shadow',
      name,
      { x: drawX + 1, y: drawY + 1 },
      '#000',
    );
    this.addAtlasTextSprites(
      'ui:nameplate:text',
      name,
      { x: drawX, y: drawY },
      color,
    );
  }
```

Leave `private addChatBubbleSprites(...)` (which follows) intact.

- [ ] **Step 4: Remove the three now-unused imports**

Deleting that method makes exactly three imports unused (verified — every other symbol it used is also used elsewhere in `map.ts`). Remove these single lines:

- Line 19: `  getCharacterIntersecting,` (in the `from '@/collision'` block)
- Line 33: `  COLORS,` (in the `from '@/consts'` block)
- Line 68: `  capitalize,` (in the `from '@/utils'` block)

Keep `SitState`, `AdminLevel`, `CharacterDeathAnimation`, `CharacterSpellChantAnimation`, `CharacterWalkAnimation`, `continuousWalkOffset`, `WALK_OFFSETS`, `HALF_TILE_WIDTH`, `HALF_TILE_HEIGHT` — all still used elsewhere in the file.

- [ ] **Step 5: Typecheck and lint**

Run:
```bash
cd /Users/cfraser/Projects/eoweb && pnpm exec tsc --noEmit
cd /Users/cfraser/Projects/eoweb && pnpm exec biome check src/ui/containers/in-game.tsx src/map.ts
```
Expected: tsc clean (this confirms no other unused imports / dangling refs remain — `addNameplateSprites` is private, so nothing external referenced it). biome clean on the two files. If tsc/biome reports any *additional* unused import in `map.ts`, remove exactly what it names (analysis says only the three above should be affected).

- [ ] **Step 6: Commit**

```bash
git -C /Users/cfraser/Projects/eoweb add src/ui/containers/in-game.tsx src/map.ts
git -C /Users/cfraser/Projects/eoweb commit -m "feat(player): mount PlayerTooltip, delete sprite nameplate

Wire <PlayerTooltip> into the in-game overlay and delete addNameplateSprites
+ its call site (the character branch was its last user; NPC/ground branches
already moved to DOM tooltips). Removes three now-unused imports.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: End-to-end verification

Client-only — verify by running the app. No automated tests cover the rendered hover.

**Files:** none (manual verification)

- [ ] **Step 1: Full build**

```bash
cd /Users/cfraser/Projects/eoweb && pnpm build 2>&1 | tail -20
```
Expected: `tsc && vite build` succeeds (exit 0). This is the strongest automated integration check.

- [ ] **Step 2: Run the client**

```bash
cd /Users/cfraser/Projects/eoweb && pnpm dev
```
Log in (a running reoserv is needed; no server change this feature, so any current build works).

- [ ] **Step 3: Verify the behavior**

- Hover **your own player** (or another player) → DOM tooltip shows **Name**, **Lvl N**, the **class name** (Warrior/Rogue/Archer/Mage/Priest), and **Guild: `<tag>`** if in a guild.
- Hover a **guildless** player → no guild row.
- The old single-line sprite name no longer appears over players (no doubled name).
- The tooltip **follows the player smoothly while walking** (not snapping to the destination tile).
- **NPC tooltips still work** (Task 1 refactor didn't regress them): hover a combat NPC → name/level/element rows as before.
- Sit on a chair/floor → tooltip still anchors above the head.
- (If testable) an invisible admin-hidden player shows no tooltip to a non-admin; a chat bubble / death animation suppresses the tooltip.

- [ ] **Step 4: (No cleanup needed)** — no temporary content edits this feature (unlike the NPC element authoring). Leave the working tree as-is.

---

## Self-Review

**Spec coverage** (against `Web Client/Documentation/Planning/Player hover tooltips.md`):
- D1 (guild tag, hide when none) → `buildPlayerTooltipModel` guild row, Task 3.
- D2 (replace sprite nameplate; retire `addNameplateSprites`) → Task 4 (delete method + call site).
- D3 (shared `<EntityTooltip>` + `EntityTooltipModel`/`TooltipRow` + `useTooltipFrame`; refactor NpcTooltip) → Task 1.
- D4 (carry over guards: invisible/admin, chat/death/spell-chant; capitalize; sit-state up-offset) → `PlayerTooltip` guards + `sitUpOffset`, Task 3.
- Hover tracking mirrors `hoveredNpcIndex` → Task 2.
- Class via `getEcfRecordById(classId).name`, omit when no record → Task 3.
- Verification (run it; smooth follow; NPC tooltip not regressed) → Task 5.

**Placeholder scan:** none — every step has concrete code or an exact command.

**Type consistency:** `EntityTooltipModel { name; level?; rows: TooltipRow[] }` and `TooltipRow { text; color? }` (Task 1) are consumed identically by `buildNpcTooltipModel` (Task 1) and `buildPlayerTooltipModel` (Task 3), and rendered by `<EntityTooltip>` (Task 1). `useTooltipFrame(client)` signature matches both call sites. `Client.hoveredCharacterId` (Task 2) is read in Task 3. `getCharacterById(id)` returns `CharacterMapInfo`, the exact type `buildPlayerTooltipModel` accepts. `charAt.id` (Task 2) is the player id consumed by `getCharacterById` and `getEntityIsoScreenPosition('char:<id>')`.
