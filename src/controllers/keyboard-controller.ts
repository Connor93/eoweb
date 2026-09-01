import { Direction, Emote, ItemSubtype, MapTileSpec, SitState } from 'eolib';
import type { Client } from '@/client';
import { CombatElement } from '@/combat-overlay/element-colors';
import {
  HOTBAR_COOLDOWN_TICKS,
  WALK_TICKS as WALK_ANIMATION_TICKS,
} from '@/consts';
import { EOResourceID } from '@/edf';
import { GameState } from '@/game-state';
import {
  type Animation,
  CharacterAttackAnimation,
  CharacterRangedAttackAnimation,
  CharacterWalkAnimation,
  TimedAnimation,
} from '@/render';
import { SfxId } from '@/sfx';
import { bigCoordsToCoords, getNextCoords, isBowMetadata } from '@/utils';
import { DEFAULT_ARROW_SHAPE } from '@/vfx-engine';
import { getTimestamp } from './movement-controller';

// Shim for the transition period (T9→T12): tick-based animations gate input
// via ticks > 0; timed animations (ticks always 0) gate via !finished instead.
function isAnimationActive(a: Animation | undefined): boolean {
  if (!a) return false;
  if (a instanceof TimedAnimation) return !a.finished;
  return Boolean(a.ticks);
}

enum Input {
  Up = 0,
  Down = 1,
  Left = 2,
  Right = 3,
  SitStand = 4,
  Attack = 5,
  EmoteHappy = 6,
  EmoteDepressed = 7,
  EmoteSad = 8,
  EmoteAngry = 9,
  EmoteConfused = 10,
  EmoteSurprised = 11,
  EmoteHearts = 12,
  EmoteMoon = 13,
  EmoteSuicidal = 14,
  EmoteEmbarassed = 15,
  EmotePlayful = 16,
  Hotbar1 = 17,
  Hotbar2 = 18,
  Hotbar3 = 19,
  Hotbar4 = 20,
  Hotbar5 = 21,
  Tab = 22,
  Refresh = 23,
  Hotbar6 = 24,
  ViewCharacter = 25,
  ViewInventory = 26,
  ViewSpells = 27,
  Unknown = -1,
}

function inputToDirection(input: Input): Direction | null {
  switch (input) {
    case Input.Up:
      return Direction.Up;
    case Input.Down:
      return Direction.Down;
    case Input.Left:
      return Direction.Left;
    case Input.Right:
      return Direction.Right;
    default:
      return null;
  }
}

// Physical key code → game input. Tracking the physical code (rather than only
// the logical input) matters because several codes share one input: Space and
// both Control keys all attack, KeyW and ArrowUp both walk up. Keying held
// state on the logical input alone meant releasing either one cleared it while
// the other was still physically down.
const CODE_TO_INPUT: Record<string, Input | undefined> = {
  KeyW: Input.Up,
  ArrowUp: Input.Up,
  KeyA: Input.Left,
  ArrowLeft: Input.Left,
  KeyS: Input.Down,
  ArrowDown: Input.Down,
  KeyD: Input.Right,
  ArrowRight: Input.Right,
  KeyX: Input.SitStand,
  Space: Input.Attack,
  ControlLeft: Input.Attack,
  ControlRight: Input.Attack,
  NumpadDecimal: Input.EmoteEmbarassed,
  Numpad0: Input.EmotePlayful,
  Numpad1: Input.EmoteHappy,
  Numpad2: Input.EmoteDepressed,
  Numpad3: Input.EmoteSad,
  Numpad4: Input.EmoteAngry,
  Numpad5: Input.EmoteConfused,
  Numpad6: Input.EmoteSurprised,
  Numpad7: Input.EmoteHearts,
  Numpad8: Input.EmoteMoon,
  Numpad9: Input.EmoteSuicidal,
  Digit1: Input.Hotbar1,
  Digit2: Input.Hotbar2,
  Digit3: Input.Hotbar3,
  Digit4: Input.Hotbar4,
  Digit5: Input.Hotbar5,
  Digit6: Input.Hotbar6,
  Tab: Input.Tab,
  KeyR: Input.Refresh,
  KeyC: Input.ViewCharacter,
  KeyE: Input.ViewInventory,
  KeyP: Input.ViewSpells,
};

// Reverse index, built once: input → every code bound to it.
const INPUT_TO_CODES: Record<number, string[]> = (() => {
  const out: Record<number, string[]> = {};
  for (const [code, input] of Object.entries(CODE_TO_INPUT)) {
    if (input === undefined) continue;
    const codes = out[input] ?? [];
    codes.push(code);
    out[input] = codes;
  }
  return out;
})();

// The game keymap must not fire — and must not preventDefault — while the
// player is typing. Chat's input stops propagation itself, but ~14 dialog
// inputs (amount, trade, lookup, barber, settings sliders) do not, so typing
// "1" into a quantity box used to trigger hotbar slot 1.
function isTextEntryTarget(e: KeyboardEvent): boolean {
  const el = (e.target as Element | null) ?? document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  );
}

const WALK_TICKS = WALK_ANIMATION_TICKS - 1;
//const DRAG_THRESHOLD = 30;

// ms constants for the two rates that had no server-side configurability
// before the speed-split (face = 1 tick = 120ms; sit = 4 ticks = 480ms).
const FACE_MS = 120;
const SIT_MS = 480;
// Turn-then-walk gate from STANDSTILL — keeps tap-to-face possible (a tap
// shorter than this faces without stepping). Mid-movement turns bypass it
// entirely (see wasJustWalking). Feel-tuned with the user; vanilla was 240ms.
const TURN_WALK_DELAY_MS = 120;
// How long after a step completes the player still counts as "in motion"
// for instant turn chaining (covers frame jitter at the step boundary).
const MOVING_GRACE_MS = 100;

export class KeyboardController {
  private client: Client;

  // ms-deadline gates for the four action inputs (face/attack/walk/sit).
  // Initialised to 0 so the first action fires immediately on spawn.
  private nextWalkAt = 0;
  private nextAttackAt = 0;
  private nextFaceAt = 0;
  private nextSitAt = 0;
  // When the last walk was dispatched — lets mid-movement turns chain into
  // the next step with zero delay (no tap-vs-hold ambiguity while moving).
  private lastWalkAt = 0;

  private wasJustWalking(now: number, moveMs: number): boolean {
    return now - this.lastWalkAt <= moveMs + MOVING_GRACE_MS;
  }

  // Tick-based gates retained for actions that stay in tick().
  private hotbarTicks = HOTBAR_COOLDOWN_TICKS;
  private minimapTicks = WALK_TICKS;
  private refreshTicks = WALK_TICKS;
  private dialogOpenTicks = WALK_TICKS;
  private frozen = false;

  private held: boolean[] = [];
  private lastInputHeld: Input[] = [];
  // Physical keys currently down, and the virtual inputs held by the on-screen
  // touch controls. `held` is resolved from the union of the two.
  private heldCodes = new Set<string>();
  private touchHeld: boolean[] = [];

  private toggleDialogSubscribers: ((id: string) => void)[] = [];
  private toggleCommandPaletteSubscribers: (() => void)[] = [];

  constructor(client: Client) {
    this.client = client;
    this.setupListeners();
  }

  subscribeToggleDialog(cb: (id: string) => void): void {
    this.toggleDialogSubscribers.push(cb);
  }

  unsubscribeToggleDialog(cb: (id: string) => void): void {
    this.toggleDialogSubscribers = this.toggleDialogSubscribers.filter(
      (s) => s !== cb,
    );
  }

  notifyToggleDialog(id: string): void {
    for (const cb of this.toggleDialogSubscribers) cb(id);
  }

  subscribeToggleCommandPalette(cb: () => void): void {
    this.toggleCommandPaletteSubscribers.push(cb);
  }

  unsubscribeToggleCommandPalette(cb: () => void): void {
    this.toggleCommandPaletteSubscribers =
      this.toggleCommandPaletteSubscribers.filter((s) => s !== cb);
  }

  notifyToggleCommandPalette(): void {
    for (const cb of this.toggleCommandPaletteSubscribers) cb();
  }

  private setupListeners() {
    // Capture-phase listener: runs before stopPropagation on any child element.
    // If a game-UI button has focus, preventDefault() suppresses native button
    // activation (Space/Enter → click) and blur it so game inputs take over.
    window.addEventListener(
      'keydown',
      (e) => {
        if (document.activeElement instanceof HTMLButtonElement) {
          e.preventDefault();
          document.activeElement.blur();
        }
      },
      { capture: true },
    );

    window.addEventListener('keydown', (e) => {
      // Global chords are handled before the typing guard so they keep working
      // from anywhere, exactly as they did before that guard existed.
      if ((e.ctrlKey || e.metaKey) && ['=', '+', '-', '_'].includes(e.key)) {
        e.preventDefault();
        if (e.key === '=' || e.key === '+') {
          this.client.viewportController.zoomIn();
        } else {
          this.client.viewportController.zoomOut();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyP') {
        e.preventDefault();
        this.notifyToggleCommandPalette();
        return;
      }

      // The movement/hotbar keymap below must not fire — and must not
      // preventDefault — while the player is typing.
      if (isTextEntryTarget(e) || this.client.typing) return;

      const input = CODE_TO_INPUT[e.code];
      if (input === undefined) return;

      this.setKeyHeld(e.code, true);

      // Attack is bound to Ctrl, so every movement/hotbar key doubles as a
      // browser chord: Ctrl+1..6 switches tab, Ctrl+R reloads, Ctrl+D
      // bookmarks, Ctrl+S saves, Ctrl+A selects all, and bare Space/arrows
      // scroll the page. Claiming the key here suppresses all of that.
      //
      // metaKey is exempt: ⌘ is never a game modifier, so ⌘C/⌘V/⌘W keep
      // working on macOS. Ctrl+W / Ctrl+T / Ctrl+Tab are reserved by the
      // browser and cannot be suppressed at all — the beforeunload guard
      // below is the only available mitigation for those.
      if (!e.metaKey) e.preventDefault();
    });

    // Keyup deliberately has NO text-entry guard: if a key goes down in the
    // game and focus then moves into a text field, the release must still be
    // honoured or that key stays held forever.
    window.addEventListener('keyup', (e) => {
      if (CODE_TO_INPUT[e.code] !== undefined) {
        this.setKeyHeld(e.code, false);
      }
    });

    // Focus loss strands held keys: the OS delivers the keyup to whichever
    // window took focus, never to us, and requestAnimationFrame keeps running
    // at full rate when another *application* (rather than another tab) is in
    // front — so update() would go on dispatching walk/attack packets off a
    // stale held[]. Release everything instead.
    const release = () => this.releaseAllInputs();
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) release();
    });

    // Ctrl+W is the one collision preventDefault() cannot fix — browsers
    // reserve it — and W is the primary movement key. Downgrade an accidental
    // tab close to a "Leave site?" confirm, but only while actually in-game.
    window.addEventListener('beforeunload', (e) => {
      if (this.client.state !== GameState.InGame) return;
      e.preventDefault();
      // Legacy spelling — still required by some browsers to arm the prompt.
      e.returnValue = '';
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.deltaY < 0) this.client.viewportController.zoomIn();
          else if (e.deltaY > 0) this.client.viewportController.zoomOut();
        }
      },
      { passive: false },
    );
  }

  setTouchDirection(direction: Direction | null): void {
    this.setTouchHeld(Input.Up, direction === Direction.Up);
    this.setTouchHeld(Input.Down, direction === Direction.Down);
    this.setTouchHeld(Input.Left, direction === Direction.Left);
    this.setTouchHeld(Input.Right, direction === Direction.Right);
  }

  setTouchAttack(held: boolean): void {
    this.setTouchHeld(Input.Attack, held);
  }

  setTouchSitStand(held: boolean): void {
    this.setTouchHeld(Input.SitStand, held);
  }

  private setTouchHeld(input: Input, down: boolean): void {
    this.touchHeld[input] = down;
    this.resolveInput(input);
  }

  private setKeyHeld(code: string, down: boolean): void {
    const input = CODE_TO_INPUT[code];
    if (input === undefined) return;
    if (down) this.heldCodes.add(code);
    else this.heldCodes.delete(code);
    this.resolveInput(input);
  }

  // An input stays held while any code bound to it is down, or while the
  // touch button for it is pressed.
  private resolveInput(input: Input): void {
    const byKey = (INPUT_TO_CODES[input] ?? []).some((c) =>
      this.heldCodes.has(c),
    );
    this.updateInputHeld(input, byKey || this.touchHeld[input] === true);
  }

  /** Drop every held input — used when the window loses focus. */
  releaseAllInputs(): void {
    this.heldCodes.clear();
    this.touchHeld = [];
    this.held = [];
    this.lastInputHeld = [];
  }

  private updateInputHeld(input: Input, down: boolean) {
    this.held[input] = down;
    const index = this.lastInputHeld.indexOf(input);
    if (down) {
      if (index === -1) this.lastInputHeld.push(input);
    }
  }

  private isInputHeld(input: Input): boolean {
    return this.held[input] || false;
  }

  private isOrWasInputHeld(input: Input): boolean {
    return this.held[input] || this.wasInputHeldLastTick(input);
  }

  private getLastHeldDirection(): Input | null {
    const directions = this.lastInputHeld.filter((i) =>
      [Input.Up, Input.Down, Input.Left, Input.Right].includes(i),
    );
    return directions[directions.length - 1] ?? null;
  }

  private wasInputHeldLastTick(input: Input): boolean {
    return this.lastInputHeld.indexOf(input) > -1;
  }

  private clearUnheldInput() {
    for (let i = this.lastInputHeld.length - 1; i >= 0; --i) {
      if (!this.held[this.lastInputHeld[i]]) {
        this.lastInputHeld.splice(i, 1);
      }
    }
  }

  freeze() {
    this.frozen = true;
  }

  unfreeze() {
    this.frozen = false;
  }

  // A rate change re-derives pending deadlines from the moment of the last
  // action rather than letting the old (possibly much slower) deadline play
  // out — buffs feel instant, debuffs apply from the next action.
  retargetGates(attackMs: number, moveMs: number): void {
    const now = performance.now();
    this.nextAttackAt = Math.min(this.nextAttackAt, now + attackMs);
    this.nextWalkAt = Math.min(this.nextWalkAt, now + moveMs);
  }

  // Per-frame action dispatch: walk / attack / face / sit gates use ms
  // deadlines instead of 120ms tick counters so server-driven rates of any
  // value are respected without quantisation to 120ms multiples.
  //
  // clearUnheldInput is intentionally NOT called here — it stays in tick()
  // so that a key tap shorter than ~16ms (one frame) is still present when
  // the next 120ms tick reads it for hotbar/dialog/etc. Moving it here would
  // prune released keys within a single frame and cause quick-taps to be
  // missed by those tick-paced handlers.
  update(now: number): void {
    if (
      this.frozen ||
      this.client.state !== GameState.InGame ||
      this.client.typing
    ) {
      return;
    }

    const character = this.client.getPlayerCharacter();
    if (!character) {
      return;
    }

    const animation = this.client.animationController.characterAnimations.get(
      character.playerId,
    );
    const lastHeldDirection = this.getLastHeldDirection();
    const attackHeld = this.wasInputHeldLastTick(Input.Attack);
    const sitStandHeld = this.wasInputHeldLastTick(Input.SitStand);
    // NOTE: clearUnheldInput is NOT called here — see method comment above.

    if (
      lastHeldDirection !== null &&
      this.client.movementController.autoWalkPath.length
    ) {
      this.client.movementController.autoWalkPath = [];
    }

    if (isAnimationActive(animation)) {
      return;
    }

    const lastDirectionHeld =
      lastHeldDirection !== null ? inputToDirection(lastHeldDirection) : null;

    if (character.sitState === SitState.Stand && lastDirectionHeld !== null) {
      if (
        now >= this.nextFaceAt &&
        character.direction !== lastDirectionHeld &&
        !animation
      ) {
        character.direction = lastDirectionHeld;
        this.client.movementController.face(lastDirectionHeld);
        const { attackMs, moveMs } = this.client.getPlayerRates(
          this.client.playerId,
        );
        this.nextFaceAt = now + FACE_MS;
        // Mid-movement turns chain instantly: if this face landed within a
        // step's length of the last walk the player is clearly still moving
        // (held key), so there's no tap-vs-hold ambiguity to disambiguate.
        // From standstill, a short gate keeps tap-to-face possible.
        this.nextWalkAt = this.wasJustWalking(now, moveMs)
          ? now
          : now + TURN_WALK_DELAY_MS;
        this.nextAttackAt = now + attackMs * 0.4; // old: ATTACK_TICKS-3 = 2 ticks = 240ms = 0.4 × 600
        return;
      }
    }

    if (
      now >= this.nextAttackAt &&
      attackHeld &&
      character.sitState === SitState.Stand
    ) {
      const metadata = this.client.getWeaponMetadata(
        character.equipment.weapon,
      );

      if (isBowMetadata(metadata)) {
        const shield = this.client.equipment.shield;
        const record = this.client.getEifRecordById(shield);
        if (!record || record.subtype !== ItemSubtype.Arrows) {
          this.client.audioController.playById(SfxId.NoArrows);
          this.client.toastController.showWarning(
            this.client.getResourceString(
              EOResourceID.STATUS_LABEL_YOU_HAVE_NO_ARROWS,
            ),
          );
          // No-arrows fail: reset all three gates to full durations (walk was
          // 3 ticks = 360ms before; full moveMs is deliberately conservative).
          const { attackMs, moveMs } = this.client.getPlayerRates(
            this.client.playerId,
          );
          this.nextAttackAt = now + attackMs;
          this.nextFaceAt = now + FACE_MS;
          this.nextWalkAt = now + moveMs;
          return;
        }
      }

      const { attackMs, moveMs } = this.client.getPlayerRates(
        this.client.playerId,
      );
      this.client.animationController.characterAnimations.set(
        character.playerId,
        metadata.ranged
          ? new CharacterRangedAttackAnimation(attackMs)
          : new CharacterAttackAnimation(attackMs),
      );

      // reoserv excludes the attacker from its own Attack/Player broadcast,
      // so handlers/attack.ts's openShot call never fires for the local
      // player — this is the only place the local player's own shot opens.
      if (isBowMetadata(metadata)) {
        const element =
          this.client.instanceController
            .list()
            .find((i) => i.equippedSlot === 8)?.element ?? CombatElement.Plain;
        const shapeId =
          this.client.itemArrowKinds.get(this.client.equipment.weapon) ??
          DEFAULT_ARROW_SHAPE;
        this.client.projectileController.openShot(
          character.playerId,
          attackMs,
          element,
          shapeId,
        );
      }

      this.client.movementController.attack(
        character.direction,
        getTimestamp(),
      );
      this.nextAttackAt = now + attackMs;
      this.nextFaceAt = now + FACE_MS;
      this.nextWalkAt = now + moveMs * 0.75; // old gate was 2 ticks = 240ms; 0.75 × moveMs is animation-dominated — no visible change
      return;
    }

    if (character.sitState === SitState.Stand && lastDirectionHeld !== null) {
      if (
        now >= this.nextFaceAt &&
        character.direction !== lastDirectionHeld &&
        !animation &&
        !this.isInputHeld(Input.Attack)
      ) {
        character.direction = lastDirectionHeld;
        this.client.movementController.face(lastDirectionHeld);
        const { attackMs, moveMs } = this.client.getPlayerRates(
          this.client.playerId,
        );
        this.nextFaceAt = now + FACE_MS;
        // Mid-movement turns chain instantly (see the matching comment on
        // the pre-attack face site above).
        this.nextWalkAt = this.wasJustWalking(now, moveMs)
          ? now
          : now + TURN_WALK_DELAY_MS;
        this.nextAttackAt = now + attackMs * 0.4; // old: ATTACK_TICKS-3 = 2 ticks = 240ms = 0.4 × 600
        return;
      }

      if (this.client.warpQueued) {
        return;
      }

      if (
        now >= this.nextWalkAt &&
        (character.direction === lastDirectionHeld ||
          animation instanceof CharacterWalkAnimation)
      ) {
        const from = bigCoordsToCoords(character.coords);
        const to = getNextCoords(
          from,
          lastDirectionHeld,
          this.client.map!.width,
          this.client.map!.height,
        );

        const door = this.client.mapController.getDoor(to);
        if (door && !door.open) {
          this.client.mapController.openDoor(to);
          this.nextWalkAt =
            now + this.client.getPlayerRates(this.client.playerId).moveMs;
          return;
        }

        if (this.client.mapController.chestAt(to)) {
          this.client.chestController.openChest(to);
          this.nextWalkAt =
            now + this.client.getPlayerRates(this.client.playerId).moveMs;
          return;
        }

        if (this.client.lockerController.lockerAt(to)) {
          this.client.lockerController.openLocker(to);
          this.nextWalkAt =
            now + this.client.getPlayerRates(this.client.playerId).moveMs;
          return;
        }

        const boardSpec = this.client.mapController.boardAt(to);
        if (boardSpec !== undefined) {
          this.client.boardController.openBoard(boardSpec - MapTileSpec.Board1);
          this.nextWalkAt =
            now + this.client.getPlayerRates(this.client.playerId).moveMs;
          return;
        }

        if (this.client.mapController.jukeboxAt(to)) {
          this.client.jukeboxController.openJukebox(to);
          this.nextWalkAt =
            now + this.client.getPlayerRates(this.client.playerId).moveMs;
          return;
        }

        if (
          this.client.mapController.isFacingChairAt(to) &&
          !this.client.mapController.occupied(to)
        ) {
          this.client.mapController.sitChair(to);
          this.nextWalkAt =
            now + this.client.getPlayerRates(this.client.playerId).moveMs;
          return;
        }

        if (!this.client.mapController.canWalk(to)) {
          this.nextWalkAt =
            now + this.client.getPlayerRates(this.client.playerId).moveMs;
          return;
        }

        character.direction = lastDirectionHeld;
        character.coords.x = to.x;
        character.coords.y = to.y;
        this.client.movementController.walk(
          lastDirectionHeld,
          from,
          to,
          getTimestamp(),
        );
        const { moveMs } = this.client.getPlayerRates(this.client.playerId);
        this.lastWalkAt = now;
        this.nextWalkAt = now + moveMs;
        this.nextFaceAt = now + FACE_MS;
        this.nextSitAt = now + SIT_MS;
        return;
      }
    }

    if (now >= this.nextSitAt && sitStandHeld) {
      if (character.sitState === SitState.Stand) {
        this.client.movementController.sit();
      } else {
        this.client.movementController.stand();
      }
      this.nextSitAt = now + SIT_MS;
    }
  }

  tick() {
    this.hotbarTicks = Math.max(this.hotbarTicks - 1, 0);
    this.minimapTicks = Math.max(this.minimapTicks - 1, 0);
    this.refreshTicks = Math.max(this.refreshTicks - 1, 0);
    this.dialogOpenTicks = Math.max(this.dialogOpenTicks - 1, 0);

    if (
      this.frozen ||
      this.client.state !== GameState.InGame ||
      this.client.typing
    ) {
      this.clearUnheldInput();
      return;
    }

    const character = this.client.getPlayerCharacter();
    if (!character) {
      return;
    }

    if (this.isOrWasInputHeld(Input.Hotbar1) && this.hotbarTicks === 0) {
      this.client.hotbarController.activate(0);
      this.hotbarTicks = HOTBAR_COOLDOWN_TICKS;
    } else if (this.isOrWasInputHeld(Input.Hotbar2) && this.hotbarTicks === 0) {
      this.client.hotbarController.activate(1);
      this.hotbarTicks = HOTBAR_COOLDOWN_TICKS;
    } else if (this.isOrWasInputHeld(Input.Hotbar3) && this.hotbarTicks === 0) {
      this.client.hotbarController.activate(2);
      this.hotbarTicks = HOTBAR_COOLDOWN_TICKS;
    } else if (this.isOrWasInputHeld(Input.Hotbar4) && this.hotbarTicks === 0) {
      this.client.hotbarController.activate(3);
      this.hotbarTicks = HOTBAR_COOLDOWN_TICKS;
    } else if (this.isOrWasInputHeld(Input.Hotbar5) && this.hotbarTicks === 0) {
      this.client.hotbarController.activate(4);
      this.hotbarTicks = HOTBAR_COOLDOWN_TICKS;
    } else if (this.isOrWasInputHeld(Input.Hotbar6) && this.hotbarTicks === 0) {
      this.client.hotbarController.activate(5);
      this.hotbarTicks = HOTBAR_COOLDOWN_TICKS;
    }

    if (this.isOrWasInputHeld(Input.Tab) && this.minimapTicks === 0) {
      this.client.audioController.playById(SfxId.ButtonClick);
      this.client.toggleMinimap();
      this.minimapTicks = WALK_TICKS;
    }

    if (this.isOrWasInputHeld(Input.Refresh) && this.refreshTicks === 0) {
      this.client.refresh();
      this.refreshTicks = WALK_TICKS;
    }

    if (
      this.isOrWasInputHeld(Input.ViewCharacter) &&
      this.dialogOpenTicks === 0
    ) {
      this.notifyToggleDialog('character');
      this.dialogOpenTicks = WALK_TICKS;
    }

    if (
      this.isOrWasInputHeld(Input.ViewInventory) &&
      this.dialogOpenTicks === 0
    ) {
      this.notifyToggleDialog('inventory');
      this.dialogOpenTicks = WALK_TICKS;
    }

    if (this.isOrWasInputHeld(Input.ViewSpells) && this.dialogOpenTicks === 0) {
      this.notifyToggleDialog('spells');
      this.dialogOpenTicks = WALK_TICKS;
    }

    // clearUnheldInput is called once per 120ms tick — this is intentional.
    // update() runs per-frame (~16ms) but deliberately does NOT prune released
    // keys, so a quick tap that is already released when update() runs is still
    // visible to tick()'s hotbar/dialog handlers via wasInputHeldLastTick.
    this.clearUnheldInput();

    const emote = this.client.animationController.characterEmotes.get(
      this.client.playerId,
    );
    if (emote) {
      return;
    }

    if (this.isInputHeld(Input.EmotePlayful)) {
      this.client.movementController.emote(Emote.Playful);
      return;
    }

    if (this.isInputHeld(Input.EmoteEmbarassed)) {
      this.client.movementController.emote(Emote.Embarrassed);
      return;
    }

    if (this.isInputHeld(Input.EmoteHappy)) {
      this.client.movementController.emote(Emote.Happy);
      return;
    }

    if (this.isInputHeld(Input.EmoteDepressed)) {
      this.client.movementController.emote(Emote.Depressed);
      return;
    }

    if (this.isInputHeld(Input.EmoteSad)) {
      this.client.movementController.emote(Emote.Sad);
      return;
    }

    if (this.isInputHeld(Input.EmoteAngry)) {
      this.client.movementController.emote(Emote.Angry);
      return;
    }

    if (this.isInputHeld(Input.EmoteConfused)) {
      this.client.movementController.emote(Emote.Confused);
      return;
    }

    if (this.isInputHeld(Input.EmoteSurprised)) {
      this.client.movementController.emote(Emote.Surprised);
      return;
    }

    if (this.isInputHeld(Input.EmoteHearts)) {
      this.client.movementController.emote(Emote.Hearts);
      return;
    }

    if (this.isInputHeld(Input.EmoteMoon)) {
      this.client.movementController.emote(Emote.Moon);
      return;
    }

    if (this.isInputHeld(Input.EmoteSuicidal)) {
      this.client.movementController.emote(Emote.Suicidal);
      return;
    }
  }
}
