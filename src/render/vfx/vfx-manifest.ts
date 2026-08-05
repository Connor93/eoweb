export type VfxDef = {
  // Real CC0 sheet (horizontal strip) — filled in when curated into public/vfx/:
  sheet?: string;
  frameWidth?: number;
  frameHeight?: number;
  frames?: number;
  fps?: number;
  // Shared + procedural-placeholder params (used when `sheet` is absent/unloaded):
  tint?: number; // placeholder color (0xRRGGBB)
  durationMs?: number; // placeholder duration
  additive?: boolean;
  scale?: number;
};

// effect_ref → def. `cast-burst`/`fire-impact` use curated CC0 sheets (see
// public/vfx/ATTRIBUTION.md). A curated CC0 sheet is wired in by setting
// sheet/frameWidth/frameHeight/frames/fps; the tint/durationMs fields remain
// as the fallback if the sheet fails to load. Every other effect ref
// (including `buff-aura`, now a vfx-engine "special") resolves through the
// generated `@/vfx-engine` registry instead — see vfx-loader.ts.
export const SHEETS: Record<string, VfxDef> = {
  'cast-burst': {
    sheet: 'ring-burst.png',
    frameWidth: 100,
    frameHeight: 100,
    frames: 55,
    fps: 60,
    tint: 0x88ccff,
    durationMs: 450,
    additive: true,
    scale: 1,
  },
  'fire-impact': {
    sheet: 'fire-flicker.png',
    frameWidth: 64,
    frameHeight: 64,
    frames: 10,
    fps: 25,
    tint: 0xff8844,
    durationMs: 400,
    additive: true,
    scale: 1,
  },
};
