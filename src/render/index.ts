// IMPORTANT: `./animation` MUST be re-exported before `./vfx/skill-burst` (and any
// other module that `extends TimedAnimation` via this barrel). Reordering causes a
// runtime "Cannot access 'TimedAnimation' before initialization" TDZ crash that tsc
// does NOT catch. Keep animation first.
export { Animation, TimedAnimation } from './animation';
export { CharacterAttackAnimation } from './character-attack';
export { CharacterRangedAttackAnimation } from './character-attack-ranged';
export { CharacterDeathAnimation } from './character-death';
export { CharacterSpellChantAnimation } from './character-spell-chant';
export { CharacterWalkAnimation } from './character-walk';
export { ChatBubble } from './chat-bubble';
// Effects & UI
export { CursorClickAnimation } from './cursor-click';
export {
  EffectAnimation,
  EffectTarget,
  EffectTargetCharacter,
  EffectTargetNpc,
  EffectTargetTile,
} from './effect';
export { Emote } from './emote';
export { NpcAttackAnimation } from './npc-attack';
export { NpcDeathAnimation } from './npc-death';
export { NpcElementGlow } from './npc-element-vfx';
export { NpcWalkAnimation } from './npc-walk';
export { Projectile, type ProjectileVisual } from './projectile';
export { SkillBurst } from './vfx/skill-burst';
export { type ResolvedVfx, VfxLoader } from './vfx/vfx-loader';
export {
  WeaponElementGlow,
  weaponAnchorScreen,
  weaponGraphicIndex,
} from './weapon-element-vfx';
