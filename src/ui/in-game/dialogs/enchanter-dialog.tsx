import { useEffect, useState } from 'preact/hooks';
import { GiCrystalCluster, GiCrystalShine, GiCutDiamond } from 'react-icons/gi';
import {
  ENCHANT_REROLL_ALL,
  ENCHANT_REROLL_ONE,
  ENCHANT_UPGRADE_RARITY,
  ENCHANT_UPGRADE_ROLL,
  InstanceRarity,
  instanceRarityLabel,
} from '@/controllers';
import {
  Button,
  ItemIcon,
  rarityBorderClass,
  rarityTextClass,
} from '@/ui/components';
import { UI_ITEM_BG, UI_PANEL_BORDER } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { useItemDrag } from '@/ui/in-game';
import { categoryForItemType, formatInstanceMod } from '@/utils';
import { DialogBase } from './dialog-base';

type ShardCategory = 'weapon' | 'armor' | 'accessory';

/** Small crystal-shard glyph, colour-coded per category — mirrors the
 *  icon choices in `inventory-grid.tsx`'s shard bar so the same currency
 *  reads the same way everywhere it appears. */
function ShardGlyph({ category }: { category: ShardCategory }) {
  switch (category) {
    case 'weapon':
      return (
        <span class='text-amber-400'>
          <GiCrystalShine size={14} />
        </span>
      );
    case 'armor':
      return (
        <span class='text-sky-400'>
          <GiCrystalCluster size={14} />
        </span>
      );
    case 'accessory':
      return (
        <span class='text-violet-400'>
          <GiCutDiamond size={14} />
        </span>
      );
  }
}

/**
 * Enchanter dialog — drag-to-select (Task 8) plus the four spend operations
 * (Task 9): upgrade rarity, re-roll one mod, re-roll all mods, upgrade a
 * mod's roll. Costs come from `EnchanterController.costFor`, which mirrors
 * the server's pricing formula so the displayed number always matches what
 * gets charged. Affordability is checked against the item's shard category
 * balance (`SalvageController.shardCounts`) — buttons are disabled, not
 * hidden, so the player can see what a locked-out action would cost.
 */
export function EnchanterDialog() {
  const client = useClient();
  const { locale } = useLocale();
  const { currentDrag } = useItemDrag();
  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    client.enchanterController.subscribeChanged(bump);
    client.instanceController.subscribeChanged(bump);
    // Balances (family 60) and the item's mod list (family 54) both change
    // after a successful enchant — re-render so costs/affordability and the
    // mod list stay live without a dialog re-open.
    client.salvageController.subscribeChanged(bump);
    return () => {
      client.enchanterController.unsubscribeChanged(bump);
      client.instanceController.unsubscribeChanged(bump);
      client.salvageController.unsubscribeChanged(bump);
    };
  }, [client]);

  const selectedId = client.enchanterController.selectedInstanceId;
  const inst = selectedId
    ? client.instanceController.byInstanceId(selectedId)
    : undefined;
  const record = inst ? client.getEifRecordById(inst.baseItemId) : undefined;
  const graphicId = record?.graphicId ?? null;
  const name =
    record?.name ??
    (inst
      ? locale.shared.itemFallbackName.replace('{id}', String(inst.baseItemId))
      : '');

  const isDragTarget = !!currentDrag && currentDrag.source === 'inventory';

  const category = record ? categoryForItemType(record.type) : null;
  const balance = category ? client.salvageController.shardCounts[category] : 0;

  const costFor = (op: number) =>
    inst ? client.enchanterController.costFor(op, inst.level, inst.rarity) : 0;
  const upgradeRarityCost = costFor(ENCHANT_UPGRADE_RARITY);
  const rerollAllCost = costFor(ENCHANT_REROLL_ALL);
  const rerollOneCost = costFor(ENCHANT_REROLL_ONE);
  const upgradeRollCost = costFor(ENCHANT_UPGRADE_ROLL);

  return (
    <DialogBase id='enchanter' title={locale.enchanter.title} size='md'>
      <div class='flex flex-col gap-2 p-2'>
        <div
          data-enchanter-drop
          class={`relative flex min-h-24 flex-col items-center justify-center gap-2 rounded border-2 p-3 transition-colors ${
            inst ? rarityBorderClass(inst.rarity) : UI_PANEL_BORDER
          } ${UI_ITEM_BG} ${
            isDragTarget ? 'outline-dashed outline-2 outline-primary/40' : ''
          }`}
        >
          {inst ? (
            <div class='flex w-full items-center gap-3'>
              <div
                class={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border ${UI_PANEL_BORDER} bg-base-300 p-1.5`}
              >
                {graphicId === null ? (
                  <div class='h-10 w-10 rounded bg-base-content/10' />
                ) : (
                  <ItemIcon
                    graphicId={graphicId}
                    alt={name}
                    class='h-10 w-10 object-contain'
                  />
                )}
              </div>
              <div class='flex min-w-0 flex-col gap-0.5'>
                <span
                  class={`wrap-break-word font-medium text-sm leading-tight ${rarityTextClass(inst.rarity)}`}
                >
                  {name} ({instanceRarityLabel(inst.rarity)})
                </span>
                <span class='text-base-content/60 text-xs tabular-nums'>
                  Lv{inst.level} &middot; {inst.mods.length} mod
                  {inst.mods.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          ) : (
            <p class='py-4 text-center text-base-content/50 text-sm'>
              {locale.enchanter.dropHint}
            </p>
          )}

          {isDragTarget && (
            <div class='pointer-events-none absolute inset-0 flex items-center justify-center'>
              <span class='rounded bg-primary/20 px-2 py-1 font-semibold text-primary text-xs'>
                {locale.enchanter.dropHint}
              </span>
            </div>
          )}
        </div>

        {inst && category && (
          <div
            class={`flex items-center justify-between rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} px-2 py-1 text-xs`}
          >
            <span class='flex items-center gap-1.5'>
              <ShardGlyph category={category} />
              <span class='tabular-nums'>
                {locale.enchanter.balanceLabel}: {balance.toLocaleString()}
              </span>
            </span>
          </div>
        )}

        {inst && (
          <div class='flex gap-2'>
            <Button
              variant={['sm']}
              class='flex-1'
              disabled={
                inst.rarity === InstanceRarity.Legendary ||
                balance < upgradeRarityCost
              }
              onClick={() =>
                client.enchanterController.sendAction(
                  inst.instanceId,
                  ENCHANT_UPGRADE_RARITY,
                  0,
                )
              }
            >
              {locale.enchanter.upgradeRarity} (
              {upgradeRarityCost.toLocaleString()})
            </Button>
            <Button
              variant={['sm']}
              class='flex-1'
              disabled={balance < rerollAllCost}
              onClick={() =>
                client.enchanterController.sendAction(
                  inst.instanceId,
                  ENCHANT_REROLL_ALL,
                  0,
                )
              }
            >
              {locale.enchanter.rerollAll} ({rerollAllCost.toLocaleString()})
            </Button>
          </div>
        )}

        {inst && inst.mods.length > 0 && (
          <ul class='flex flex-col gap-1'>
            {inst.mods.map((mod, i) => (
              <li
                key={i}
                class={`flex flex-col gap-1.5 rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} px-2 py-1 text-xs`}
              >
                <span>{formatInstanceMod(mod)}</span>
                <div class='flex gap-1'>
                  <Button
                    variant={['xs']}
                    class='flex-1'
                    disabled={balance < rerollOneCost}
                    onClick={() =>
                      client.enchanterController.sendAction(
                        inst.instanceId,
                        ENCHANT_REROLL_ONE,
                        i,
                      )
                    }
                  >
                    {locale.enchanter.rerollOne} (
                    {rerollOneCost.toLocaleString()})
                  </Button>
                  <Button
                    variant={['xs']}
                    class='flex-1'
                    disabled={balance < upgradeRollCost}
                    onClick={() =>
                      client.enchanterController.sendAction(
                        inst.instanceId,
                        ENCHANT_UPGRADE_ROLL,
                        i,
                      )
                    }
                  >
                    {locale.enchanter.upgradeRoll} (
                    {upgradeRollCost.toLocaleString()})
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogBase>
  );
}
