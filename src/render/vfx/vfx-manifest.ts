import { SHEET_DEFS } from '@/vfx-engine';

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

// effect_ref → def, for the curated CC0 sheets only (see public/vfx/
// ATTRIBUTION.md). Every other effect ref — including `buff-aura`, now a
// vfx-engine "special" — resolves through the generated `@/vfx-engine`
// registry instead; see vfx-loader.ts, which checks SHEETS first.
//
// DERIVED, not hand-written: the frame geometry is owned by the vfx-engine's
// `SHEET_DEFS` so that eoweb and the AIO editor read one source. The editor
// previews these same sheets with Canvas2D `drawImage` and must slice them
// identically — a second copy of these numbers here is exactly how the two
// would silently disagree. This function only re-shapes that data into the
// Pixi-side `VfxDef` the loader already expects; `tint`/`durationMs` are the
// fallback values used if a PNG fails to load (the real sheet duration is
// derived from frames/fps inside `buildSheet`).
export const SHEETS: Record<string, VfxDef> = Object.fromEntries(
  Object.entries(SHEET_DEFS).map(([name, def]) => [
    name,
    {
      sheet: def.file,
      frameWidth: def.frameWidth,
      frameHeight: def.frameHeight,
      frames: def.frames,
      fps: def.fps,
      tint: def.fallbackTint,
      durationMs: def.fallbackDurationMs,
      additive: def.additive,
      scale: 1,
    },
  ]),
);
