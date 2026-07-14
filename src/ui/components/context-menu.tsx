import { type ComponentChildren, createContext } from 'preact';
import { createPortal } from 'preact/compat';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/hooks';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface ContextMenuApi {
  open: (x: number, y: number, items: ContextMenuItem[]) => void;
  close: () => void;
}

const ContextMenuContext = createContext<ContextMenuApi>({
  open: () => {},
  close: () => {},
});

export function useContextMenu(): ContextMenuApi {
  return useContext(ContextMenuContext);
}

const MENU_W = 160; // px; matches minWidth below
const MENU_ITEM_H = 30; // px per row, for the bottom-edge clamp

export function ContextMenuProvider({
  children,
}: {
  children: ComponentChildren;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    setMenu({ x, y, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  // Close on Escape, scroll, or an outside pointer press.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onScroll = () => close();
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return; // click inside → let the button handle it
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    // Defer so the opening interaction doesn't immediately self-close.
    const id = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [menu, close]);

  let style: Record<string, string | number> = {};
  if (menu) {
    const height = menu.items.length * MENU_ITEM_H;
    const left = Math.min(menu.x, window.innerWidth - MENU_W - 4);
    const top = Math.min(menu.y, window.innerHeight - height - 4);
    style = {
      position: 'fixed',
      left: Math.max(4, left),
      top: Math.max(4, top),
      zIndex: 10000,
      minWidth: MENU_W,
    };
  }

  return (
    <ContextMenuContext.Provider value={{ open, close }}>
      {children}
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            class='rounded bg-base-300 py-1 text-sm shadow-lg'
            style={style}
            onContextMenu={(e) => e.preventDefault()}
          >
            {menu.items.map((item) => (
              <button
                type='button'
                key={item.label}
                disabled={item.disabled}
                class='block w-full px-3 py-1 text-left hover:bg-base-200 disabled:opacity-50'
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick();
                  close();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.getElementById('ui') ?? document.body,
        )}
    </ContextMenuContext.Provider>
  );
}
