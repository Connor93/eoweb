import type { ComponentChildren, Ref } from 'preact';
import { createPortal } from 'preact/compat';
import { useCallback, useState } from 'preact/hooks';

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

const GAP = 4; // px gap between trigger edge and tooltip
const TOOLTIP_MAX_W = 208; // Tailwind max-w-52

/**
 * Renders `children` as the hover/touch target and teleports the `tooltip`
 * into `#ui` (fixed-position) so it escapes any overflow-hidden container.
 *
 * Placement: above the trigger by default; flips below when the trigger top
 * is within `flipThreshold` px of the viewport top (default 120 px).
 *
 * `align`:
 *   'center'  — horizontally centred on the trigger (BreakdownTooltip style)
 *   'right'   — right-edge aligned to the trigger (SpeedValue style)
 *
 * `forceOpen` — show regardless of hover state (e.g. touch-opened).
 * `triggerRef` — optional external ref forwarded to the wrapper <span> so
 *                callers can use it for outside-tap detection.
 * `onPointerDown` — forwarded to the wrapper <span>.
 */
interface Props {
  tooltip: ComponentChildren;
  align?: 'center' | 'right';
  flipThreshold?: number;
  wrapperClass?: string;
  forceOpen?: boolean;
  triggerRef?: Ref<HTMLSpanElement>;
  onPointerDown?: (e: PointerEvent) => void;
  children: ComponentChildren;
}

export function PortalTooltip({
  tooltip,
  align = 'center',
  flipThreshold = 120,
  wrapperClass = '',
  forceOpen = false,
  triggerRef,
  onPointerDown,
  children,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);

  // Capture rect from the span via a callback ref so we always read fresh coords
  const captureRef = useCallback(
    (el: HTMLSpanElement | null) => {
      // Forward to external ref if provided
      if (typeof triggerRef === 'function') {
        triggerRef(el);
      } else if (triggerRef && 'current' in triggerRef) {
        (triggerRef as { current: HTMLSpanElement | null }).current = el;
      }
    },
    [triggerRef],
  );

  const handleMouseEnter = useCallback((e: MouseEvent) => {
    const el = e.currentTarget as HTMLSpanElement;
    const r = el.getBoundingClientRect();
    setAnchorRect({
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
    });
    setHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);

  const visible = hovered || forceOpen;

  const style: Record<string, string | number> = {
    position: 'fixed',
    zIndex: 9999,
    pointerEvents: 'none',
    maxWidth: TOOLTIP_MAX_W,
  };

  if (anchorRect) {
    const flipBelow = anchorRect.top < flipThreshold;

    if (flipBelow) {
      // Flip: render below the trigger
      style.top = anchorRect.bottom + GAP;
    } else {
      // Default: render above the trigger.
      // Use top + translateY(-100%) so the tooltip's bottom hugs the trigger top.
      style.top = anchorRect.top - GAP;
      style.transform = 'translateY(-100%)';
    }

    if (align === 'center') {
      const centre = anchorRect.left + anchorRect.width / 2;
      style.left = Math.max(GAP, centre - TOOLTIP_MAX_W / 2);
    } else {
      // Right-align: right edge of tooltip = right edge of trigger
      style.left = Math.max(GAP, anchorRect.right - TOOLTIP_MAX_W);
    }
  }

  return (
    <span
      ref={captureRef}
      class={wrapperClass}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={onPointerDown}
    >
      {children}
      {visible &&
        anchorRect &&
        createPortal(
          <div
            class='rounded bg-base-300 px-2 py-1 text-left text-xs shadow-lg'
            style={style}
          >
            {tooltip}
          </div>,
          document.getElementById('ui') ?? document.body,
        )}
    </span>
  );
}
