import { TimedAnimation } from './animation';

/** Fraction of a ranged attack cycle the bow stays raised.
 *
 *  Unlike the melee attack, the ranged pose is a SINGLE frame with no
 *  progression, so holding the attack button left the character frozen in the
 *  drawn position while arrows simply appeared out of a static figure. Past
 *  this point in the cycle the renderer drops back to the standing pose, so
 *  the bow visibly lowers between shots and is re-raised for the next one.
 *
 *  MUST stay comfortably above the projectile controller's RELEASE_FRACTION
 *  (0.25) — the bow has to still be up at the moment the arrow leaves it. If
 *  release is ever moved later, move this with it.
 */
export const RANGED_BOW_UP_FRACTION = 0.55;

export class CharacterRangedAttackAnimation extends TimedAnimation {}
