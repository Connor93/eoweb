import type { Client } from '@/client';

// "Range: 5 tiles" for weapons that reach farther than one tile; null
// otherwise (melee weapons swing at adjacent range — no number belongs to the
// item). Fed by the sparse family-55 map, which only carries reach > 1.
export function rangeLine(client: Client, itemId: number): string | null {
  const tiles = client.itemAttackRanges.get(itemId);
  if (!tiles) {
    return null;
  }
  return `Range: ${tiles} tiles`;
}
