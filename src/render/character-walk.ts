import type { Direction } from 'eolib';
import type { Vector2 } from '@/vector';
import { TimedAnimation } from './animation';

const WALK_FRAMES = 4;

export class CharacterWalkAnimation extends TimedAnimation {
  from: Vector2;
  to: Vector2;
  direction: Direction;
  jump: boolean;

  constructor(
    from: Vector2,
    to: Vector2,
    direction: Direction,
    jump: boolean,
    durationMs: number,
  ) {
    super(durationMs);
    this.from = from;
    this.to = to;
    this.direction = direction;
    this.jump = jump;
  }

  advance(deltaMs: number): void {
    super.advance(deltaMs);
    // 4 sprite poses spread evenly over the duration.
    this.animationFrame = Math.min(
      Math.floor(this.progress * WALK_FRAMES),
      WALK_FRAMES - 1,
    );
  }
}
