import { SKILL_ICONS } from './skill-icon-manifest';

export type SkillIconTone = 'debuff' | 'buff' | 'neutral';

// Mono tints per tone; `active` (toggle-on / armed) brightens via a filter.
const TINT: Record<SkillIconTone, string> = {
  debuff: '#f87171', // red-400
  buff: '#fbbf24', // amber-400
  neutral: '#e8e8f0',
};
const FALLBACK_BG: Record<SkillIconTone, string> = {
  debuff: '#7f1d1d', // red-900
  buff: '#3b3b52',
  neutral: '#3b3b52',
};

/**
 * Skill/status icon: a mono mask-tinted game-icons SVG when `iconId` is a
 * vendored slug, else the initial-letter fallback (matching the old chip).
 */
export function SkillIcon({
  iconId,
  label,
  tone,
  active = false,
  sizeClass = 'h-5 w-5',
}: {
  iconId?: string;
  label?: string;
  tone: SkillIconTone;
  active?: boolean;
  sizeClass?: string;
}) {
  if (iconId && SKILL_ICONS.has(iconId)) {
    const url = `url(/icons/${iconId}.svg)`;
    return (
      <span
        class={`${sizeClass} shrink-0`}
        style={{
          maskImage: url,
          WebkitMaskImage: url,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          backgroundColor: TINT[tone],
          filter: active ? 'brightness(1.35)' : undefined,
        }}
      />
    );
  }
  return (
    <span
      class={`${sizeClass} flex shrink-0 items-center justify-center rounded font-bold text-[10px]`}
      style={{ backgroundColor: FALLBACK_BG[tone], color: TINT[tone] }}
    >
      {(label?.[0] ?? '?').toUpperCase()}
    </span>
  );
}
