// Per-kind visual + default timing/compositing params. Draw functions must
// be pure & deterministic: the same (def, progress) always paints the same
// pixels, so NEVER call Math.random() — derive jitter from the particle
// index instead (e.g. `i * 2.399`). eoweb rasterizes frames to textures
// while a separate editor animates continuously; both must match.
//
// 3 kinds (ring, disc, spark-burst) are fully implemented here as the seed
// pattern for the rest. The other 12 are registered (so `buildRegistry`
// already generates the full palette) but stubbed to throw — a follow-up
// task fills their `draw` bodies.

import type { ShapeKind, VfxDef } from './types';

export interface KindConfig {
  durationMs: number;
  frames: number;
  additive: boolean;
  draw(
    ctx: CanvasRenderingContext2D,
    progress: number,
    def: VfxDef,
    cx: number,
    cy: number,
  ): void;
}

function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// Blends `color` toward white by `amount` (0..1) — used for a "brighter
// core" highlight without needing a second palette entry.
function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return (lr << 16) | (lg << 8) | lb;
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const radius = progress * 48 * def.sizeScale;
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 3;
  ctx.strokeStyle = toHex(def.color);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDisc(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const radius = progress * 44 * def.sizeScale;

  ctx.globalAlpha = 0.6 * (1 - progress);
  ctx.fillStyle = toHex(def.color);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Brighter core ring to sell a "hot center".
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 2;
  ctx.strokeStyle = toHex(lighten(def.color, 0.6));
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSparkBurst(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const sparkCount = 14;
  const length = progress * 46 * def.sizeScale;
  const inner = length * 0.2;

  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 2;
  ctx.strokeStyle = toHex(def.color);

  for (let i = 0; i < sparkCount; i++) {
    // Deterministic per-spark jitter derived from the index — no Math.random().
    const angle = (i / sparkCount) * Math.PI * 2 + i * 2.399;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * length;
    const y2 = cy + Math.sin(angle) * length;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

function unimplemented(kind: ShapeKind): KindConfig['draw'] {
  return () => {
    throw new Error(`unimplemented: ${kind}`);
  };
}

// Impacts: short, punchy hits.
const IMPACT_TIMING = { durationMs: 350, frames: 12, additive: true } as const;
// Sustained/looping-feel effects: a little longer and smoother.
const FLOW_TIMING = { durationMs: 500, frames: 14, additive: true } as const;

export const KINDS: Record<ShapeKind, KindConfig> = {
  ring: { ...IMPACT_TIMING, draw: drawRing },
  disc: { ...IMPACT_TIMING, draw: drawDisc },
  'spark-burst': { ...IMPACT_TIMING, draw: drawSparkBurst },
  slash: { ...IMPACT_TIMING, draw: unimplemented('slash') },
  nova: { ...IMPACT_TIMING, draw: unimplemented('nova') },
  shockwave: { ...IMPACT_TIMING, draw: unimplemented('shockwave') },
  implode: { ...IMPACT_TIMING, draw: unimplemented('implode') },
  'burst-lines': { ...IMPACT_TIMING, draw: unimplemented('burst-lines') },
  sparkle: { ...FLOW_TIMING, draw: unimplemented('sparkle') },
  spiral: { ...FLOW_TIMING, draw: unimplemented('spiral') },
  vortex: { ...FLOW_TIMING, draw: unimplemented('vortex') },
  orbit: { ...FLOW_TIMING, draw: unimplemented('orbit') },
  chains: { ...FLOW_TIMING, draw: unimplemented('chains') },
  rain: { ...FLOW_TIMING, draw: unimplemented('rain') },
  'beam-pop': { ...FLOW_TIMING, draw: unimplemented('beam-pop') },
};
