import type { Client } from '@/client';

// "Attack speed: 2.5/s" for items that author a swing speed; null otherwise
// (unauthored weapons swing at the wielder's class default — no number
// belongs to the item).
export function attackSpeedLine(client: Client, itemId: number): string | null {
  const ms = client.itemAttackRates.get(itemId);
  if (!ms) {
    return null;
  }
  return `Attack speed: ${(1000 / ms).toFixed(1)}/s`;
}
