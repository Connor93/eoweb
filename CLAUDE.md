# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EOWeb is a browser-based client for Endless Online (EO), a classic 2D MMORPG using the 0.0.28 protocol. It renders an isometric game world using Pixi.js and overlays a Preact UI.

## Documentation & planning live in the Obsidian vault

**Source of truth:** `~/Documents/TBD/Endless Server (Name TBD)/`

All architecture docs, feature plans, and design decisions for this project live in that vault — **not** in this repo. The repo carries code; the vault carries intent. Specifically:

- `Web Client/Documentation/` — client architecture and subsystem notes
- `Web Client/Planning/` — client-side planning notes (e.g. `Pub Swaps.md`)
- `General/Documentation/` — cross-cutting notes (top-level `Architecture.md` is the index)
- `General/Documentation/Planning/` — cross-cutting feature plans (e.g. `Feature Ideas (Gameplay).md`)

The companion server lives in `~/Projects/reoserv/`; its planning notes are at `Server/Planning/` in the same vault — read those when the work crosses the client/server boundary.

### Workflow rules — apply every task

**Before starting work:**

1. Read the vault note(s) relevant to the task. The user may have hand-edited them since the last session; treat the vault as authoritative over anything you remember.
2. Confirm with the user what you're working on if it isn't obvious from the task. Don't guess scope.

**While working:**

3. If the task involves design decisions, **write the plan into the vault** under the appropriate `Planning/` folder rather than only laying it out in chat. The plan should survive the session.
4. Use Obsidian conventions when writing: inline `#tags`, `[[Wikilinks]]`, sentence-case filenames, Mermaid for diagrams. Match the style of existing notes.

**After finishing:**

5. Update the relevant vault note(s) to reflect what actually changed — new behavior, removed code, decisions made along the way. If a note now contradicts the code, fix the note.
6. If repo-level changes affect anything documented in this `CLAUDE.md` or in a vault doc, update both.

If you're unsure which note to update, ask before writing — the user reorganizes the vault manually and may have a specific home in mind.

## Commands

```bash
pnpm dev        # Start Vite dev server on port 3000
pnpm build      # TypeScript check + Vite production build → dist/
pnpm lint       # Biome linter check
pnpm format     # Biome auto-format
pnpm knip       # Detect unused exports/files
```

There is no test suite.

## Architecture

### Two-Layer Rendering

- **Pixi.js layer** (`src/map.ts`, `src/atlas/`, `src/render/`) — isometric game world: tiles, characters, NPCs, animations, effects. The `MapRenderer` class in `src/map.ts` is the core rendering engine.
- **Preact UI layer** (`src/ui/`) — overlaid HTML/CSS: login, character select, in-game HUD (chat, inventory, dialogs).

### Central Hub: `Client`

`src/client/client.ts` owns all game state, 40+ controllers, the WebSocket `PacketBus`, the Pixi `Application`, and `MapRenderer`. Nearly every subsystem receives a `Client` reference.

### Data Flow

```
WebSocket → PacketBus (src/bus.ts) → handlers/ → client state / controller events → UI re-render / Pixi update
```

### Game Loop (`src/main.tsx`)

120ms tick:
1. `client.tick()` — game logic
2. `client.render(interpolation)` — Pixi rendering with interpolation

### Game States

`GameState` enum (`src/game-state.ts`): `Initial` → `Connected` → `Login` / `CreateAccount` / `CharacterSelect` / ... → `InGame`.

### Controllers (`src/controllers/`)

Each controller encapsulates one domain (movement, inventory, chat, paperdoll, etc.). They:
- Take `Client` in their constructor
- Expose typed `subscribe*` methods for UI event notification
- Send packets via `this.client.bus!.send(packet)`

Prefer controller `subscribe*` pattern over the legacy `client.emit` / `ClientEvents` system (actively being phased out).

### Packet Handlers (`src/handlers/`)

One file per EO packet family. Each exports `registerXxxHandlers(client: Client)`. Packets are deserialized using `eolib` classes.

### Persistence (`src/db.ts`)

IndexedDB via `idb`. Stores: `pubs` (EIF/ENF/ECF/ESF), `maps` (EMF), `edfs` (dialog strings), `chatMessages`.

### Atlas System (`src/atlas/`)

Dynamic sprite-sheet builder. GFX files are loaded in a Web Worker (`src/gfx/gfx-loader.worker.ts`) and assembled into Pixi textures at runtime.

## Import Conventions (enforced by Biome)

- Always use the `@/` path alias — never `../` relative imports.
- Import from barrel `index.ts` files, not deep paths.
- Key barrels: `@/utils`, `@/render`, `@/controllers`, `@/handlers`, `@/gfx`, `@/fonts`, `@/ui/in-game`, `@/ui/enums`.

## UI Patterns

- **Containers** (`src/ui/containers/`) — full-screen states (login, character select, etc.)
- **In-game HUD** (`src/ui/in-game/`) — chat, dialogs, hotbar, stats, inventory
- **Components** (`src/ui/components/`) — shared DaisyUI-based components
- **Context** (`src/ui/context/`) — Preact context providers using `useMemo`
- Dialog windows are draggable, stackable by z-index, and support multiple open simultaneously.

## Tooling

- **Biome** — linter and formatter (replaces ESLint + Prettier). Config in `biome.json`.
- **Tailwind CSS 4 + DaisyUI 5** — styling. Theme switching via `document.documentElement.dataset.theme`.
- **Lefthook** — git hooks (runs lint/format on commit).
- Configuration changes dispatch the `eoweb:config-changed` custom DOM event.

## Game Data Files

Game assets (graphics, sounds, maps, data) must be copied from an official EO client installation into `public/` before the dev server is useful:
```
public/gfx/, public/sfx/, public/maps/, public/data/, public/mfx/, public/jbox/
```

## Hair Style Encoding

`hairStyle` is 1-based (0 = no hair). Atlas row offset: `(hairStyle - 1) * 40 + hairColor * 4`.

## Known Refactoring In Progress

- Game state is partially scattered across `Client`; migration to dedicated controllers is ongoing.
- `client.emit` / `ClientEvents` are deprecated; use controller-specific `subscribe*` methods instead.
