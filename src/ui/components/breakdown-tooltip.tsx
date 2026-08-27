import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { InstanceRarity } from '@/controllers';
import type { GearSource } from '@/utils';
import { PortalTooltip } from './portal-tooltip';

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
  /** Tooltip title — the stat's name. Omit for effects-line tooltips. */
  title?: string;
  /** One-line plain-English description of what the stat governs. */
  description?: string;
  /** Server-computed effect lines, already rendered to strings. */
  effectLines?: string[];
  /** "Base (class & level)" line; omit for effects lines (sources only). */
  baseLabel?: string;
  baseValue?: string;
  sources: GearSource[];
  children: ComponentChildren;
}

/** Hover/touch tooltip listing the base line + one rarity-colored line
 *  per contributing equipped item. Wraps its children as the hover
 *  target. Renders the tooltip via a portal into #ui so it escapes
 *  any overflow-hidden container. */
export function BreakdownTooltip({
  title,
  description,
  effectLines,
  baseLabel,
  baseValue,
  sources,
  children,
}: Props) {
  const [touchOpen, setTouchOpen] = useState(false);
  // ref forwarded to PortalTooltip's wrapper span for outside-tap detection
  const triggerRef = useRef<HTMLSpanElement>(null);

  // Close touch tooltip when tapping outside the trigger
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!triggerRef.current?.contains(e.target as Node)) {
        setTouchOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const hasEffect = !!title || !!description || (effectLines?.length ?? 0) > 0;
  const hasBreakdown = baseLabel !== undefined || sources.length > 0;
  const hasContent = hasBreakdown || hasEffect;
  if (!hasContent) {
    return <span>{children}</span>;
  }

  const tooltipContent = (
    <>
      {title && <div class='font-semibold'>{title}</div>}
      {description && <div class='opacity-70'>{description}</div>}
      {(effectLines?.length ?? 0) > 0 && (
        <div class='mt-1 flex flex-col'>
          {effectLines?.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {hasBreakdown && hasEffect && (
        <div class='mt-1 border-current/20 border-t pt-1' />
      )}
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
    </>
  );

  return (
    <PortalTooltip
      tooltip={tooltipContent}
      align='center'
      forceOpen={touchOpen}
      triggerRef={triggerRef}
      onPointerDown={(e: PointerEvent) => {
        if (e.pointerType === 'touch') setTouchOpen(true);
      }}
    >
      {children}
    </PortalTooltip>
  );
}
