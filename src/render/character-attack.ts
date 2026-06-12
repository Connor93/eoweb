import { TimedAnimation } from './animation';

// Fraction of the swing duration spent in the wind-up pose (frame 0) before
// flipping to the swing pose (frame 1). The old tick client showed wind-up
// for ~one frame only; with ms pacing a near-even split reads much better.
const WIND_UP_FRACTION = 0.5;

export class CharacterAttackAnimation extends TimedAnimation {
  advance(deltaMs: number): void {
    super.advance(deltaMs);
    this.animationFrame = this.progress >= WIND_UP_FRACTION ? 1 : 0;
  }
}
