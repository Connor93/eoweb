import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { InstanceRarity } from '@/controllers';
import type { GearSource } from '@/utils';

function rarityTextClass(r: InstanceRarity | null): string {
  switch (r) {
    case InstanceRarity.Rare:
      return 'text-info';
    case InstanceRarity.Epic:
      return 'text-secondary';
    case InstanceRarity.Legendary:
      return 'text-warning';
    default:
      return '';
  }
}

function formatAmount(s: GearSource): string {
  const fmt = (v: number) =>
    Math.abs(v % 1) < 0.05 ? v.toFixed(0) : v.toFixed(1);
  const scale = s.isPercent ? 100 : 1;
  const suffix = s.isPercent ? '%' : '';
  const sign = s.amount >= 0 ? '+' : '';
  if (s.amountMax !== undefined) {
    return `${sign}${fmt(s.amount * scale)}-${fmt(s.amountMax * scale)}${suffix}`;
  }
  return `${sign}${fmt(s.amount * scale)}${suffix}`;
}

interface Props {
  /** "Base (class & level)" line; omit for effects lines (sources only). */
  baseLabel?: string;
  baseValue?: string;
  sources: GearSource[];
  children: ComponentChildren;
}

/** Hover/touch tooltip listing the base line + one rarity-colored line
 *  per contributing equipped item. Wraps its children as the hover
 *  target. */
export function BreakdownTooltip({
  baseLabel,
  baseValue,
  sources,
  children,
}: Props) {
  const [touchOpen, setTouchOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!ref.current?.contains(e.target as Node)) {
        setTouchOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const hasContent = baseLabel !== undefined || sources.length > 0;

  return (
    <span
      ref={ref}
      class='group relative'
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') setTouchOpen(true);
      }}
    >
      {children}
      {hasContent && (
        <div
          class={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-max max-w-52 -translate-x-1/2 rounded bg-base-300 px-2 py-1 text-left text-xs shadow-lg ${touchOpen ? 'block' : 'hidden group-hover:block'}`}
        >
          {baseLabel !== undefined && (
            <div class='flex justify-between gap-3'>
              <span class='opacity-70'>{baseLabel}</span>
              <span>{baseValue}</span>
            </div>
          )}
          {sources.map((s, i) => (
            <div key={i} class='flex justify-between gap-3'>
              <span class={rarityTextClass(s.rarity)}>
                {s.level !== null ? `Lv${s.level} ` : ''}
                {s.name}
              </span>
              <span class='text-success'>{formatAmount(s)}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
