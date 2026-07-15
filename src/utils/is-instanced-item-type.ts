import { ItemType } from 'eolib';

// Mirrors the server's `src/items/category.rs::item_type_to_category` — an
// item is "instanced" (rolls mods, rendered as a rarity card) exactly when
// it maps to one of the three mod categories (Weapon / Armor / Accessory).
// Any change here must track the server's mapping so client and server agree
// on which crafted/bought items are instances vs plain stackables.
export function isInstancedItemType(type: ItemType): boolean {
  switch (type) {
    case ItemType.Weapon:
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
      return true;
    default:
      return false;
  }
}
