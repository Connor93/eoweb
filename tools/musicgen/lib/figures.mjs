/**
 * Repeating textures.
 *
 * These fill in the mechanical layers -- sustained harmony, arpeggio
 * figuration, percussion -- so a track file only has to spell out the parts
 * that carry actual musical intent: the melody, the harmonic plan and where
 * the silences go.
 */

/**
 * Sustained harmony that re-attacks on every bar line.
 *
 * A single note held across the whole loop would be chopped at the seam and
 * would also drift out of the soundfont's decay envelope. Re-attacking per bar
 * keeps the loop point indistinguishable from any other bar.
 */
export function drone(
  part,
  { bars, beatsPerBar, degrees, velocity, startBar = 0, gapBeats = 0 },
) {
  for (let bar = 0; bar < bars; bar += 1) {
    part.chord(
      (startBar + bar) * beatsPerBar,
      degrees,
      beatsPerBar - gapBeats,
      velocity,
    );
  }
}

/**
 * Cyclic figuration over a set of degrees.
 *
 * `restChance` is what keeps this from sounding like an exercise: dropping
 * notes at random (but seeded) leaves gaps that read as phrasing.
 */
export function arpeggio(
  part,
  {
    bars,
    beatsPerBar,
    degrees,
    noteBeats,
    velocity,
    rng,
    restChance = 0,
    octaves = [0],
    startBar = 0,
    velocityJitter = 0,
  },
) {
  const steps = Math.floor((bars * beatsPerBar) / noteBeats);

  for (let step = 0; step < steps; step += 1) {
    if (restChance > 0 && rng.chance(restChance)) {
      continue;
    }

    const degree =
      degrees[step % degrees.length] +
      7 * octaves[Math.floor(step / degrees.length) % octaves.length];

    const jitter =
      velocityJitter > 0 ? rng.int(-velocityJitter, velocityJitter) : 0;

    part.note(
      startBar * beatsPerBar + step * noteBeats,
      degree,
      noteBeats,
      Math.max(1, Math.min(127, velocity + jitter)),
    );
  }
}

/** Repeat a one-bar percussion pattern across a span of bars. */
export function pulse(
  part,
  { bars, beatsPerBar, pattern, startBar = 0, durationBeats = 0.25 },
) {
  for (let bar = 0; bar < bars; bar += 1) {
    for (const stroke of pattern) {
      part.hit(
        (startBar + bar) * beatsPerBar + stroke.beat,
        stroke.pitch,
        durationBeats,
        stroke.velocity,
      );
    }
  }
}
