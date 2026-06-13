export abstract class Animation {
  ticks!: number;
  animationFrame = 0;
  abstract tick(): void;
  renderedFirstFrame = false;
}

// ms-paced animation: advanced per render frame by elapsed wall-clock time
// instead of 120ms tick counts, so server-driven rates of any value animate
// smoothly. Character walk/attack use this; NPC + emote animations stay
// tick-based (their pacing conversion is a separate follow-up).
export abstract class TimedAnimation extends Animation {
  durationMs: number;
  elapsedMs = 0;

  constructor(durationMs: number) {
    super();
    this.ticks = 0; // unused; kept so shared code reading .ticks is safe
    this.durationMs = Math.max(1, durationMs);
  }

  // Called once per render frame with the frame delta.
  advance(deltaMs: number): void {
    if (!this.renderedFirstFrame) {
      return;
    }
    this.elapsedMs = Math.min(this.elapsedMs + deltaMs, this.durationMs);
  }

  get progress(): number {
    return this.elapsedMs / this.durationMs;
  }

  get finished(): boolean {
    return this.renderedFirstFrame && this.elapsedMs >= this.durationMs;
  }

  // Timed animations don't advance on the 120ms tick.
  tick(): void {}
}
