import { TimedAnimation } from './animation';

export class CharacterAttackAnimation extends TimedAnimation {
  advance(deltaMs: number): void {
    super.advance(deltaMs);
    // Two poses: wind-up (0) flips to swing (1) immediately after the first
    // rendered frame — preserves the old "frame 1 from first tick" feel.
    if (this.elapsedMs > 0) {
      this.animationFrame = 1;
    }
  }
}
