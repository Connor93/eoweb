import { type Direction, MapTileSpec } from 'eolib';
import type { Client } from '@/client';
import { SPELL_COOLDOWN_TICKS, SPLOOSHIE_EFFECT_ID } from '@/consts';
import type { ChatBubble } from '@/render';
import {
  type Animation,
  CharacterDeathAnimation,
  CharacterSpellChantAnimation,
  CharacterWalkAnimation,
  type CursorClickAnimation,
  EffectAnimation,
  EffectTargetCharacter,
  type Emote,
  NpcDeathAnimation,
  NpcWalkAnimation,
} from '@/render';
import { SfxId } from '@/sfx';
import type { EffectMetadata } from '@/utils';
import type { Vector2 } from '@/vector';

export class AnimationController {
  private client: Client;
  characterAnimations: Map<number, Animation> = new Map();
  pendingCharacterAnimations: Map<number, Animation> = new Map();
  npcAnimations: Map<number, Animation> = new Map();
  pendingNpcAnimations: Map<number, Animation> = new Map();
  // Authoritative NPC tile commits, applied at drain time independently of
  // which animation wins the per-index slot — so a walk's destination isn't
  // lost when an attack for the same NPC arrives in the same tick.
  pendingNpcCoords: Map<number, { x: number; y: number }> = new Map();
  // Authoritative character tile commits, applied at drain time independently
  // of which animation wins the per-player slot — so a walk's destination
  // isn't lost when an attack for the same player arrives in the same tick.
  // Mirrors pendingNpcCoords (see the NPC desync fix).
  pendingCharacterCoords: Map<
    number,
    { x: number; y: number; direction: Direction }
  > = new Map();
  characterChats: Map<number, ChatBubble> = new Map();
  npcChats: Map<number, ChatBubble> = new Map();
  characterEmotes: Map<number, Emote> = new Map();
  effects: EffectAnimation[] = [];
  cursorClickAnimation: CursorClickAnimation | undefined;

  private splooshiMetadata: EffectMetadata | undefined;

  constructor(client: Client) {
    this.client = client;
  }

  playSplooshieEffect(playerId: number): void {
    if (!this.splooshiMetadata) {
      this.splooshiMetadata =
        this.client.getEffectMetadata(SPLOOSHIE_EFFECT_ID);
    }

    this.effects.push(
      new EffectAnimation(
        SPLOOSHIE_EFFECT_ID,
        new EffectTargetCharacter(playerId),
        this.splooshiMetadata,
      ),
    );

    if (!this.splooshiMetadata.sfx) {
      return;
    }

    if (playerId === this.client.playerId) {
      this.client.audioController.playById(this.splooshiMetadata.sfx);
      return;
    }

    const position = this.client.getCharacterById(playerId)?.coords;
    if (position) {
      this.client.audioController.playAtPosition(SfxId.Water, position);
    }
  }

  // An NPC is "dying" while its death animation is queued (pending) or
  // active. Update handlers consult this so a stray/late walk or attack for
  // the same index can't clobber the queued death (which would otherwise
  // leave the NPC on screen forever — see NPC desync fix).
  isNpcDying(index: number): boolean {
    return (
      this.pendingNpcAnimations.get(index) instanceof NpcDeathAnimation ||
      this.npcAnimations.get(index) instanceof NpcDeathAnimation
    );
  }

  // A character is "dying" while its death animation is queued (pending) or
  // active. Walk/attack handlers consult this so a stray update can't clobber
  // the queued death animation in the per-player slot (mirrors isNpcDying).
  isCharacterDying(playerId: number): boolean {
    return (
      this.pendingCharacterAnimations.get(playerId) instanceof
        CharacterDeathAnimation ||
      this.characterAnimations.get(playerId) instanceof CharacterDeathAnimation
    );
  }

  isJump(coords: Vector2[]): boolean {
    for (const c of coords) {
      const spec = this.client.mapRenderer.getTileSpecAt(c);
      if (spec === MapTileSpec.Jump) {
        return true;
      }
    }

    return false;
  }

  tick(
    activeCharIds: Set<number>,
    activeNpcIds: Set<number>,
  ): { playerWalking: boolean; playerDying: boolean } {
    // Commit authoritative character coords first, decoupled from which
    // animation won the per-player slot — so a walk's destination survives an
    // attack overwriting the slot in the same tick. Applied here (not in the
    // packet handler) so coords change in lockstep with the walk animation
    // activating, which avoids a one-frame "snap to destination then back"
    // flicker. Mirrors the NPC coords drain below.
    for (const [id, pending] of this.pendingCharacterCoords) {
      const character = this.client.getCharacterById(id);
      if (character) {
        character.direction = pending.direction;
        character.coords.x = pending.x;
        character.coords.y = pending.y;
      }
    }
    this.pendingCharacterCoords.clear();

    // Drain pending animations so they're created inside the tick loop,
    // allowing the renderedFirstFrame no-op to happen in this same tick.
    for (const [id, animation] of this.pendingCharacterAnimations) {
      this.characterAnimations.set(id, animation);
    }
    this.pendingCharacterAnimations.clear();

    // Commit authoritative NPC coords first, decoupled from which animation
    // won the per-index slot — so a walk's destination survives an attack for
    // the same NPC overwriting the slot in the same tick. Applied here (not in
    // the packet handler) so coords change in lockstep with the walk animation
    // activating, which avoids a one-frame "snap to destination then back"
    // flicker.
    for (const [id, coords] of this.pendingNpcCoords) {
      const npc = this.client.nearby.npcs.find((n) => n.index === id);
      if (npc) {
        npc.coords.x = coords.x;
        npc.coords.y = coords.y;
      }
    }
    this.pendingNpcCoords.clear();

    for (const [id, animation] of this.pendingNpcAnimations) {
      // Face the walk direction only when the walk is the active animation; an
      // attack that won the slot keeps the direction its handler already set.
      if (animation instanceof NpcWalkAnimation) {
        const npc = this.client.nearby.npcs.find((n) => n.index === id);
        if (npc) {
          npc.direction = animation.direction;
        }
      }
      this.npcAnimations.set(id, animation);
    }
    this.pendingNpcAnimations.clear();

    const result = this.tickCharacterAnimations(activeCharIds);
    this.tickCharacterEmotes(activeCharIds);
    this.tickNpcAnimations(activeNpcIds);
    this.tickCursorClick();
    this.tickCharacterChatBubbles(activeCharIds);
    this.tickNpcChatBubbles(activeNpcIds);
    this.tickEffects();
    return result;
  }

  private tickCharacterAnimations(activeCharIds: Set<number>): {
    playerWalking: boolean;
    playerDying: boolean;
  } {
    const endedCharacterAnimations: number[] = [];
    let playerWalking = false;
    let playerDying = false;
    for (const [id, animation] of this.characterAnimations) {
      if (!animation.ticks || !activeCharIds.has(id)) {
        if (
          id === this.client.playerId &&
          animation instanceof CharacterSpellChantAnimation
        ) {
          this.client.spellController.castSpell(animation.spellId);
        } else if (
          id === this.client.playerId &&
          this.client.spellController.spellCooldownTicks !==
            SPELL_COOLDOWN_TICKS
        ) {
          this.client.spellController.queuedSpellId = 0;
          this.client.spellController.spellCooldownTicks = SPELL_COOLDOWN_TICKS;
        }

        if (
          id !== this.client.playerId &&
          animation instanceof CharacterDeathAnimation
        ) {
          this.client.nearby.characters = this.client.nearby.characters.filter(
            (c) => c.playerId !== id,
          );
        }

        endedCharacterAnimations.push(id);
        continue;
      }
      if (
        id === this.client.playerId &&
        animation instanceof CharacterWalkAnimation
      ) {
        playerWalking = true;
      }
      if (
        id === this.client.playerId &&
        animation instanceof CharacterDeathAnimation
      ) {
        playerDying = true;
      }
      animation.tick();
    }
    for (const id of endedCharacterAnimations) {
      this.characterAnimations.delete(id);
    }

    return { playerWalking, playerDying };
  }

  private tickCharacterEmotes(activeCharIds: Set<number>): void {
    const endedCharacterEmotes: number[] = [];
    for (const [id, emote] of this.characterEmotes) {
      if (!emote.ticks || !activeCharIds.has(id)) {
        endedCharacterEmotes.push(id);
        continue;
      }
      emote.tick();
    }
    for (const id of endedCharacterEmotes) {
      this.characterEmotes.delete(id);
    }
  }

  private tickNpcAnimations(activeNpcIds: Set<number>): void {
    const endedNpcAnimations: number[] = [];
    for (const [id, animation] of this.npcAnimations) {
      if (!animation.ticks || !activeNpcIds.has(id)) {
        endedNpcAnimations.push(id);
        continue;
      }
      animation.tick();
    }
    for (const id of endedNpcAnimations) {
      if (this.npcAnimations.get(id) instanceof NpcDeathAnimation) {
        this.client.nearby.npcs = this.client.nearby.npcs.filter(
          (n) => n.index !== id,
        );
      }
      this.npcAnimations.delete(id);
    }
  }

  private tickCursorClick(): void {
    if (this.cursorClickAnimation) {
      this.cursorClickAnimation.tick();
      if (!this.cursorClickAnimation.ticks) {
        this.cursorClickAnimation = undefined;
      }
    }
  }

  private tickCharacterChatBubbles(activeCharIds: Set<number>): void {
    const endedCharacterChatBubbles: number[] = [];
    for (const [id, bubble] of this.characterChats) {
      if (!bubble.ticks || !activeCharIds.has(id)) {
        endedCharacterChatBubbles.push(id);
        continue;
      }
      bubble.tick();
    }
    for (const id of endedCharacterChatBubbles) {
      this.characterChats.delete(id);
    }
  }

  private tickNpcChatBubbles(activeNpcIds: Set<number>): void {
    const endedNpcChatBubbles: number[] = [];
    for (const [id, bubble] of this.npcChats) {
      if (!bubble.ticks || !activeNpcIds.has(id)) {
        endedNpcChatBubbles.push(id);
        continue;
      }
      bubble.tick();
    }
    for (const id of endedNpcChatBubbles) {
      this.npcChats.delete(id);
    }
  }

  private tickEffects(): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      if (!effect.ticks && !effect.loops) {
        this.effects.splice(i, 1);
        continue;
      }
      effect.tick();
    }
  }
}
