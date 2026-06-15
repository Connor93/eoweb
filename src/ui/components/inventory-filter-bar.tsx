import { FaSearch, FaTimes } from 'react-icons/fa';
import {
  CombatElement,
  combatElementColor,
  combatElementLabel,
} from '@/combat-overlay';
import { InstanceRarity, instanceRarityLabel } from '@/controllers';
import { UI_ITEM_BG, UI_PANEL_BORDER } from '@/ui/consts';
import { useLocale } from '@/ui/context';
import { emptyItemFilter, type ItemFilter, isItemFilterActive } from '@/utils';
import { rarityTextClass } from './rarity-style';

const RARITY_CHIPS: InstanceRarity[] = [
  InstanceRarity.Common,
  InstanceRarity.Rare,
  InstanceRarity.Epic,
  InstanceRarity.Legendary,
];

// The 6 real elements — no Plain chip, so selecting elements always narrows
// to elemental gear rather than matching the (very common) plain items.
const ELEMENT_CHIPS: CombatElement[] = [
  CombatElement.Fire,
  CombatElement.Water,
  CombatElement.Earth,
  CombatElement.Wind,
  CombatElement.Light,
  CombatElement.Dark,
];

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

const CHIP_BASE =
  'rounded border px-1.5 py-0.5 text-[10px] leading-none transition-colors';
const CHIP_OFF =
  'border-base-content/15 text-base-content/50 hover:bg-base-content/5';

type Props = {
  filter: ItemFilter;
  onChange: (next: ItemFilter) => void;
};

/** Controlled search box + rarity / element filter chips. The parent
 *  owns the `ItemFilter` state (so it resets when the dialog remounts)
 *  and applies the matchers from `@/utils/item-filter`. Shared by the
 *  inventory grid and the locker dialog. */
export function InventoryFilterBar({ filter, onChange }: Props) {
  const { locale } = useLocale();
  const active = isItemFilterActive(filter);

  return (
    <div
      class={`flex flex-col gap-1 rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} p-1.5`}
    >
      <div class='flex items-center gap-1'>
        <label
          class={`input input-sm flex flex-1 items-center gap-1 border ${UI_PANEL_BORDER}`}
        >
          <span class='flex shrink-0 opacity-50'>
            <FaSearch size={11} />
          </span>
          <input
            type='text'
            class='w-full bg-transparent'
            value={filter.text}
            placeholder={locale.inventory.searchPlaceholder}
            onInput={(e) =>
              onChange({
                ...filter,
                text: (e.target as HTMLInputElement).value,
              })
            }
            // Keep game hotkeys (WASD move, E inventory, R refresh, …) from
            // firing while typing in the search box. The keyboard controller
            // listens on `window` in the bubble phase, so stopping
            // propagation here keeps it from reaching the handler — same
            // convention the guild/board/chat-log search inputs use.
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
        {active && (
          <button
            type='button'
            title={locale.inventory.filterClear}
            aria-label={locale.inventory.filterClear}
            onClick={() => onChange(emptyItemFilter())}
            class='flex h-7 w-7 shrink-0 items-center justify-center rounded border border-base-content/20 text-base-content/60 transition-colors hover:bg-base-content/10'
          >
            <FaTimes size={12} />
          </button>
        )}
      </div>

      <div class='flex flex-wrap gap-1'>
        {RARITY_CHIPS.map((r) => {
          const on = filter.rarities.has(r);
          return (
            <button
              key={r}
              type='button'
              aria-pressed={on}
              onClick={() =>
                onChange({ ...filter, rarities: toggle(filter.rarities, r) })
              }
              class={`${CHIP_BASE} ${
                on
                  ? `border-current bg-base-content/10 ${rarityTextClass(r)}`
                  : CHIP_OFF
              }`}
            >
              {instanceRarityLabel(r)}
            </button>
          );
        })}
      </div>

      <div class='flex flex-wrap gap-1'>
        {ELEMENT_CHIPS.map((e) => {
          const on = filter.elements.has(e);
          return (
            <button
              key={e}
              type='button'
              aria-pressed={on}
              onClick={() =>
                onChange({ ...filter, elements: toggle(filter.elements, e) })
              }
              style={
                on
                  ? {
                      color: combatElementColor(e),
                      borderColor: combatElementColor(e),
                    }
                  : undefined
              }
              class={`${CHIP_BASE} ${on ? 'bg-base-content/10' : CHIP_OFF}`}
            >
              {combatElementLabel(e)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
