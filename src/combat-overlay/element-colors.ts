// Maps each Element to the CSS hex used by combat popups. Mirrors the
// inventory rarity palette where possible (info blue for water, warning
// orange for fire) so colors stay coherent across UI.
export enum CombatElement {
  Plain = 0,
  Fire = 1,
  Water = 2,
  Earth = 3,
  Wind = 4,
  Light = 5,
  Dark = 6,
}

export function combatElementColor(e: CombatElement): string {
  switch (e) {
    case CombatElement.Fire:
      return '#fb923c';
    case CombatElement.Water:
      return '#60a5fa';
    case CombatElement.Earth:
      return '#84cc16';
    case CombatElement.Wind:
      return '#facc15';
    case CombatElement.Light:
      return '#fde047';
    case CombatElement.Dark:
      return '#a855f7';
    default:
      return '#fff8e1'; // Plain — warm off-white, matches classic GFX damage atlas
  }
}

export function combatElementLabel(e: CombatElement): string {
  return (
    ['Plain', 'Fire', 'Water', 'Earth', 'Wind', 'Light', 'Dark'][e] ?? 'Plain'
  );
}
