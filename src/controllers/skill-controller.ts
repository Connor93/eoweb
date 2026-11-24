import { EoWriter, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import { EOResourceID } from '@/edf';
import { getChebyshevDistance, isTileSpecWalkable, tileLine } from '@/utils';
import type { Vector2 } from '@/vector';

const FAMILY_SKILL = 62;

// Reject reason codes (mirror the server's SKILL_REJECT_* consts).
const REJECT_UNAFFORDABLE = 1;
const REJECT_ON_COOLDOWN = 2;
const REJECT_UNKNOWN = 3;
const REJECT_INVALID_TARGET = 4;
const REJECT_OUT_OF_RANGE = 5;
const REJECT_NOT_LEARNED = 6;
// Target NPC is kill-steal protected (fighting someone outside your party).
const REJECT_PROTECTED = 7;
// Ground-area cast whose square holds no valid enemy.
const REJECT_NO_TARGETS = 8;

// Learn reject reason codes (mirror the server's LearnReject codes). A
// SEPARATE numbering from the cast-time SKILL_REJECT_* codes above.
const LEARN_REJECT_ALREADY_KNOWN = 1;
const LEARN_REJECT_WRONG_CLASS = 2;
const LEARN_REJECT_LEVEL_TOO_LOW = 3;
const LEARN_REJECT_NOT_ENOUGH_POINTS = 4;
const LEARN_REJECT_NO_SUCH_SKILL = 5;

function learnRejectMessage(reason: number): string | null {
  switch (reason) {
    case LEARN_REJECT_ALREADY_KNOWN:
      return 'You already know that skill.';
    case LEARN_REJECT_WRONG_CLASS:
      return 'Your class cannot learn that skill.';
    case LEARN_REJECT_LEVEL_TOO_LOW:
      return 'You are not a high enough level to learn that skill.';
    case LEARN_REJECT_NOT_ENOUGH_POINTS:
      return 'You do not have enough skill points.';
    case LEARN_REJECT_NO_SUCH_SKILL:
      return 'Unknown skill.';
    default:
      return null;
  }
}

export interface SkillCatalogEntry {
  skillId: string;
  name: string;
  iconId: string;
  costHp: number;
  costTp: number;
  cooldownMs: number;
  /** 'unknown' = a target code this client doesn't understand; never cast. */
  target: 'self' | 'enemy' | 'ground' | 'unknown';
  /** Cast range in tiles (chebyshev). 0 = use the equipped weapon's range. */
  range: number;
  /** VFX ref to burst at the caster on a successful cast. Empty = none. */
  castVfx: string;
  /** VFX ref to burst at the target on impact. Empty = none. */
  impactVfx: string;
  /** Class allowed to learn this. 0 = any. */
  classRequirement: number;
  minLevel: number;
  skillPointCost: number;
  /** Flavour text for the hover tooltip. Empty = no tooltip. */
  description: string;
  /** Ground skills: blast square radius in tiles (1 = 3x3). */
  areaRadius: number;
  /** Ground skills: a wall between caster and aimed tile prevents the cast. */
  areaThrowBlocked: boolean;
}

interface CooldownState {
  readyAt: number; // performance.now()-based deadline
  totalMs: number; // for the sweep-arc fraction
}

export class SkillController {
  private client: Client;
  catalog = new Map<string, SkillCatalogEntry>();
  knownSkills = new Set<string>();
  selectedSkillId: string | null = null;
  private cooldowns = new Map<string, CooldownState>();
  private subscribers: (() => void)[] = [];

  constructor(client: Client) {
    this.client = client;
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== fn);
    };
  }

  private notify(): void {
    for (const fn of this.subscribers) fn();
  }

  // --- inbound (from src/handlers/skill.ts) ---

  setCatalog(entries: SkillCatalogEntry[]): void {
    this.catalog = new Map(entries.map((e) => [e.skillId, e]));
    this.notify();
  }

  /**
   * Authoritative learned set + current skill points, from
   * `SkillKnownServerPacket`. Skill points have a single owner —
   * `client.skillPoints` — shared with level-up/recover/item/stat-skill
   * flows, so we write through rather than keeping a local copy.
   */
  setKnown(skillIds: string[], skillPoints: number): void {
    this.knownSkills = new Set(skillIds);
    this.client.skillPoints = skillPoints;
    this.notify();
  }

  /** Outcome of one `requestLearn`, from `SkillLearnReplyServerPacket`. */
  applyLearnReply(
    ok: boolean,
    reason: number,
    skillId: string,
    skillPointsRemaining: number,
  ): void {
    this.client.skillPoints = skillPointsRemaining;
    if (ok) {
      this.knownSkills.add(skillId);
    } else {
      const message = learnRejectMessage(reason);
      if (message) this.client.toastController.showWarning(message);
    }
    this.notify();
  }

  isKnown(skillId: string): boolean {
    return this.knownSkills.has(skillId);
  }

  handleReply(
    skillId: string,
    ok: boolean,
    reason: number,
    cooldownMs: number,
  ): void {
    if (ok || reason === REJECT_ON_COOLDOWN) {
      // ok → cooldown just started (full); on_cooldown → authoritative remaining.
      this.startCooldown(skillId, cooldownMs);
    } else if (reason === REJECT_UNAFFORDABLE) {
      this.client.toastController.showWarning(
        this.client.locale.skills.notEnoughTp,
      );
    } else if (reason === REJECT_UNKNOWN) {
      this.client.toastController.showWarning(
        this.client.locale.skills.unknownSkill,
      );
    } else if (reason === REJECT_INVALID_TARGET) {
      this.client.toastController.showWarning(
        this.client.locale.skills.invalidTarget,
      );
    } else if (reason === REJECT_OUT_OF_RANGE) {
      this.client.toastController.showWarning(
        this.client.locale.skills.outOfRange,
      );
    } else if (reason === REJECT_NOT_LEARNED) {
      this.client.toastController.showWarning(
        this.client.locale.skills.notLearned,
      );
    } else if (reason === REJECT_NO_TARGETS) {
      this.client.toastController.showWarning(
        this.client.locale.skills.noTargets,
      );
    } else if (reason === REJECT_PROTECTED) {
      // Same message melee shows on a protected NPC (handlers/npc.ts).
      this.client.toastController.showWarning(
        this.client.getResourceString(
          EOResourceID.STATUS_LABEL_UNABLE_TO_ATTACK,
        ),
      );
    }
    this.notify();
  }

  private startCooldown(skillId: string, cooldownMs: number): void {
    if (cooldownMs <= 0) {
      this.cooldowns.delete(skillId);
      return;
    }
    this.cooldowns.set(skillId, {
      readyAt: performance.now() + cooldownMs,
      totalMs: cooldownMs,
    });
  }

  // --- outbound ---

  arm(skillId: string): void {
    this.selectedSkillId = skillId;
    this.notify();
  }

  clearArmed(): void {
    if (this.selectedSkillId !== null) {
      this.selectedSkillId = null;
      this.notify();
    }
  }

  /** `tile` is the aimed tile for ground skills (sent as 0,0 otherwise). */
  use(skillId: string, targetNpcIndex = 0, tile?: Vector2): void {
    if (this.remainingMs(skillId) > 0) return; // locally gated; server re-checks
    const writer = new EoWriter();
    const idBytes = new TextEncoder().encode(skillId);
    writer.addChar(idBytes.length);
    writer.addBytes(idBytes);
    writer.addShort(targetNpcIndex);
    writer.addChar(tile?.x ?? 0);
    writer.addChar(tile?.y ?? 0);
    this.client.bus?.sendBuf(
      FAMILY_SKILL as PacketFamily,
      PacketAction.Use,
      writer.toByteArray(),
    );
  }

  /** Fire-and-forget; the server is authoritative and answers on `Accept`. */
  requestLearn(skillId: string): void {
    const writer = new EoWriter();
    const idBytes = new TextEncoder().encode(skillId);
    writer.addChar(idBytes.length);
    writer.addBytes(idBytes);
    this.client.bus?.sendBuf(
      FAMILY_SKILL as PacketFamily,
      PacketAction.Add,
      writer.toByteArray(),
    );
  }

  entryOf(skillId: string): SkillCatalogEntry | undefined {
    return this.catalog.get(skillId);
  }

  // --- cooldown queries (for the hotbar sweep) ---

  remainingMs(skillId: string): number {
    const cd = this.cooldowns.get(skillId);
    if (!cd) return 0;
    return Math.max(0, cd.readyAt - performance.now());
  }

  /** 0 (ready) → 1 (just cast). Drives the conic-gradient sweep. */
  fraction(skillId: string): number {
    const cd = this.cooldowns.get(skillId);
    if (!cd || cd.totalMs <= 0) return 0;
    return Math.max(0, Math.min(1, this.remainingMs(skillId) / cd.totalMs));
  }

  tick(): void {
    let changed = false;
    for (const [id, cd] of this.cooldowns) {
      if (cd.readyAt <= performance.now()) {
        this.cooldowns.delete(id);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  // --- range resolution (for pre-check + tile highlight) ---

  /** Effective cast range in tiles: explicit range, or the equipped weapon's
   *  range for range:0 (sparse map; melee/absent -> 1). */
  effectiveRange(entry: SkillCatalogEntry): number {
    if (entry.range > 0) {
      return entry.range;
    }
    return this.client.itemAttackRanges.get(this.client.equipment.weapon) ?? 1;
  }

  /** Range of the currently-armed enemy skill, or null if none is armed. */
  armedEnemyRange(): number | null {
    if (!this.selectedSkillId) {
      return null;
    }
    const entry = this.catalog.get(this.selectedSkillId);
    if (!entry || entry.target !== 'enemy') {
      return null;
    }
    return this.effectiveRange(entry);
  }

  /** Cast range of the armed enemy OR ground skill (drives the range square
   *  around the player), or null if nothing targetable is armed. */
  armedRange(): number | null {
    if (!this.selectedSkillId) {
      return null;
    }
    const entry = this.catalog.get(this.selectedSkillId);
    if (!entry || (entry.target !== 'enemy' && entry.target !== 'ground')) {
      return null;
    }
    return this.effectiveRange(entry);
  }

  /** Where an armed ground skill is aimed right now — set by the map
   *  renderer every frame (NPC under the cursor → its tile, else the cursor
   *  tile), read by the click handler so the click casts exactly where the
   *  blast square is drawn. Null when no ground skill is armed. */
  groundAimTile: Vector2 | null = null;

  /** The armed ground-area skill, or null if none is armed. */
  armedGroundSkill(): SkillCatalogEntry | null {
    if (!this.selectedSkillId) {
      return null;
    }
    const entry = this.catalog.get(this.selectedSkillId);
    return entry?.target === 'ground' ? entry : null;
  }

  /** Whether the server will accept a ground cast aimed at `tile`, short of
   *  the no-targets check: in map bounds, within chebyshev cast range, and —
   *  for throw-blocked skills — no blocking tile on the line from the player
   *  (end tile included). Mirrors reoserv `ground_cast_check`. */
  canCastGroundAt(entry: SkillCatalogEntry, tile: Vector2): boolean {
    const map = this.client.map;
    if (
      !map ||
      tile.x < 0 ||
      tile.y < 0 ||
      tile.x > map.width ||
      tile.y > map.height
    ) {
      return false;
    }
    const player = this.client.getPlayerCoords();
    if (getChebyshevDistance(player, tile) > this.effectiveRange(entry)) {
      return false;
    }
    if (!entry.areaThrowBlocked) {
      return true;
    }
    return tileLine(player, tile).every((t) =>
      isTileSpecWalkable(this.client.mapRenderer.getTileSpecAt(t)),
    );
  }
}
