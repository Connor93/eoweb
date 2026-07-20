import { EoWriter, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';

const FAMILY_SKILL = 62;

// Reject reason codes (mirror the server's SKILL_REJECT_* consts).
const REJECT_UNAFFORDABLE = 1;
const REJECT_ON_COOLDOWN = 2;
const REJECT_UNKNOWN = 3;
const REJECT_INVALID_TARGET = 4;

export interface SkillCatalogEntry {
  skillId: string;
  name: string;
  iconId: string;
  costHp: number;
  costTp: number;
  cooldownMs: number;
  target: 'self' | 'enemy';
}

interface CooldownState {
  readyAt: number; // performance.now()-based deadline
  totalMs: number; // for the sweep-arc fraction
}

export class SkillController {
  private client: Client;
  catalog = new Map<string, SkillCatalogEntry>();
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

  use(skillId: string, targetNpcIndex = 0): void {
    if (this.remainingMs(skillId) > 0) return; // locally gated; server re-checks
    const writer = new EoWriter();
    const idBytes = new TextEncoder().encode(skillId);
    writer.addChar(idBytes.length);
    writer.addBytes(idBytes);
    writer.addShort(targetNpcIndex);
    this.client.bus?.sendBuf(
      FAMILY_SKILL as PacketFamily,
      PacketAction.Use,
      writer.toByteArray(),
    );
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
}
