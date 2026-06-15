import { InstanceRarity } from '@/controllers';
import { UI_PANEL_BORDER } from '@/ui/consts';

/** Border color class for an instance card, keyed by rarity. Common
 *  uses the neutral panel border; higher tiers get accent colors.
 *  Shared by the inventory grid, locker dialog, and the filter-bar
 *  rarity chips so the rarity palette stays consistent everywhere. */
export function rarityBorderClass(r: InstanceRarity): string {
  switch (r) {
    case InstanceRarity.Common:
      return UI_PANEL_BORDER;
    case InstanceRarity.Rare:
      return 'border-info/70';
    case InstanceRarity.Epic:
      return 'border-secondary/70';
    case InstanceRarity.Legendary:
      return 'border-warning/70';
  }
}

/** Text color class for an instance's name, keyed by rarity. */
export function rarityTextClass(r: InstanceRarity): string {
  switch (r) {
    case InstanceRarity.Common:
      return 'text-base-content/70';
    case InstanceRarity.Rare:
      return 'text-info';
    case InstanceRarity.Epic:
      return 'text-secondary';
    case InstanceRarity.Legendary:
      return 'text-warning';
  }
}
