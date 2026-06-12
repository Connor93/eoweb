import { TimedAnimation } from './animation';

// Fraction of the swing duration spent in the wind-up pose (frame 0) before
// flipping to the swing pose (frame 1). The old tick client showed wind-up
// for ~one frame only; 50/50 read wrong in testing — a short wind-up with a
// long swing/follow-through (15/85) matches the hit landing at action start.
const WIND_UP_FRACTION = 0.15;

export class CharacterAttackAnimation extends TimedAnimation {
  advance(deltaMs: number): void {
    super.advance(deltaMs);
    this.animationFrame = this.progress >= WIND_UP_FRACTION ? 1 : 0;
  }
}
