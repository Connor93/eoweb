import { ItemType } from 'eolib';

export enum InventoryTab {
  Weapons = 0,
  Armor = 1,
  Consumables = 2,
  Materials = 3,
  QuestItems = 4,
}

export const INVENTORY_TAB_COUNT = 5;

// Mirrors server's `src/character/inventory_tab.rs` — any change here must
// match the server's `tab_for_item_type` so client and server agree on which
// tab an item lives in.
export function inventoryTabForItemType(type: ItemType): InventoryTab {
  switch (type) {
    case ItemType.Weapon:
      return InventoryTab.Weapons;

    case ItemType.Shield:
    case ItemType.Armor:
    case ItemType.Hat:
    case ItemType.Boots:
    case ItemType.Gloves:
    case ItemType.Accessory:
    case ItemType.Belt:
    case ItemType.Necklace:
    case ItemType.Ring:
    case ItemType.Armlet:
    case ItemType.Bracer:
      return InventoryTab.Armor;

    case ItemType.Heal:
    case ItemType.Teleport:
    case ItemType.ExpReward:
    case ItemType.Alcohol:
    case ItemType.EffectPotion:
    case ItemType.HairDye:
    case ItemType.CureCurse:
      return InventoryTab.Consumables;

    case ItemType.Key:
      return InventoryTab.QuestItems;

    default:
      return InventoryTab.Materials;
  }
}
