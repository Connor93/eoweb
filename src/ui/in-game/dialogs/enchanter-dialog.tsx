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
import type { LocaleStrings } from '@/locale';
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

/** Spelled-out name of a shard currency, e.g. "Weapon shards". Reuses the
 *  inventory shard-bar tooltip strings so the enchanter names the currency
 *  exactly the way the player's shard footer already does — and they're
 *  translated in every locale. */
function shardNameFor(locale: LocaleStrings, category: ShardCategory): string {
  switch (category) {
    case 'weapon':
      return locale.inventory.shardsWeaponTooltip;
    case 'armor':
      return locale.inventory.shardsArmorTooltip;
    case 'accessory':
      return locale.inventory.shardsAccessoryTooltip;
  }
}

/** Price tag: the category's crystal glyph welded to the amount. The glyph is
 *  the whole point — a bare number in this window reads as gold, which the
 *  enchanter never charges (costs are shards only, of the item's own
 *  category). The glyph keeps its currency colour even when unaffordable
 *  (the colour identifies the shard type); only the amount goes red. */
function ShardCost({
  category,
  amount,
  affordable,
}: {
  category: ShardCategory;
  amount: number;
  affordable: boolean;
}) {
  return (
    <span class='ml-1 inline-flex items-center gap-0.5'>
      <ShardGlyph category={category} />
      <span class={`tabular-nums ${affordable ? '' : 'text-error'}`}>
        {amount.toLocaleString()}
      </span>
    </span>
  );
}

/**
 * An enchant operation button carrying its own price. `blockedLabel` replaces
 * the cost when the op can never run on this item (Legendary can't upgrade
 * rarity) — quoting a price you can't spend would read as "too expensive".
 *
 * The tooltip sits on the WRAPPER, not the button: `Button` sets the native
 * `disabled` attribute and daisyUI zeroes pointer events on a disabled
 * button, so a tooltip inside it would vanish exactly when the player most
 * needs to read what the option costs.
 */
function CostButton({
  label,
  cost,
  category,
  balance,
  size,
  blockedLabel,
  onClick,
}: {
  label: string;
  cost: number;
  category: ShardCategory;
  balance: number;
  size: 'sm' | 'xs';
  blockedLabel?: string;
  onClick: () => void;
}) {
  const { locale } = useLocale();
  const affordable = balance >= cost;
  const tip =
    blockedLabel ??
    locale.enchanter.costTooltip
      .replace('{amount}', cost.toLocaleString())
      .replace('{shards}', shardNameFor(locale, category));

  return (
    <span class='tooltip tooltip-top flex-1' data-tip={tip}>
      <Button
        variant={[size]}
        class='h-full w-full flex-wrap'
        disabled={!!blockedLabel || !affordable}
        onClick={onClick}
      >
        {label}
        {blockedLabel ? (
          <span class='ml-1 text-base-content/50'>({blockedLabel})</span>
        ) : (
          <ShardCost
            category={category}
            amount={cost}
            affordable={affordable}
          />
        )}
      </Button>
    </span>
  );
}

/**
 * Enchanter dialog — drag-to-select (Task 8) plus the four spend operations
 * (Task 9): upgrade rarity, re-roll one mod, re-roll all mods, upgrade a
 * mod's roll. Costs come from `EnchanterController.costFor`, which mirrors
 * the server's pricing formula so the displayed number always matches what
 * gets charged. Every price is rendered as a `ShardCost` — glyph plus amount
 * plus a tooltip naming the currency — because the enchanter spends shards
 * and never gold, and an unlabelled number here reads as gold.
 * Affordability is checked against the item's shard category balance
 * (`SalvageController.shardCounts`) — buttons are disabled, not hidden, so
 * the player can see what a locked-out action would cost.
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
              <span>
                {shardNameFor(locale, category)}:{' '}
                <span class='font-semibold tabular-nums'>
                  {balance.toLocaleString()}
                </span>
              </span>
            </span>
          </div>
        )}

        {inst && category && (
          <div class='flex items-stretch gap-2'>
            <CostButton
              label={locale.enchanter.upgradeRarity}
              cost={upgradeRarityCost}
              category={category}
              balance={balance}
              size='sm'
              blockedLabel={
                inst.rarity === InstanceRarity.Legendary
                  ? locale.enchanter.maxRarity
                  : undefined
              }
              onClick={() =>
                client.enchanterController.sendAction(
                  inst.instanceId,
                  ENCHANT_UPGRADE_RARITY,
                  0,
                )
              }
            />
            <CostButton
              label={locale.enchanter.rerollAll}
              cost={rerollAllCost}
              category={category}
              balance={balance}
              size='sm'
              onClick={() =>
                client.enchanterController.sendAction(
                  inst.instanceId,
                  ENCHANT_REROLL_ALL,
                  0,
                )
              }
            />
          </div>
        )}

        {inst && category && inst.mods.length > 0 && (
          <ul class='flex flex-col gap-1'>
            {inst.mods.map((mod, i) => (
              <li
                key={i}
                class={`flex flex-col gap-1.5 rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} px-2 py-1 text-xs`}
              >
                <span>{formatInstanceMod(mod)}</span>
                <div class='flex items-stretch gap-1'>
                  <CostButton
                    label={locale.enchanter.rerollOne}
                    cost={rerollOneCost}
                    category={category}
                    balance={balance}
                    size='xs'
                    onClick={() =>
                      client.enchanterController.sendAction(
                        inst.instanceId,
                        ENCHANT_REROLL_ONE,
                        i,
                      )
                    }
                  />
                  <CostButton
                    label={locale.enchanter.upgradeRoll}
                    cost={upgradeRollCost}
                    category={category}
                    balance={balance}
                    size='xs'
                    onClick={() =>
                      client.enchanterController.sendAction(
                        inst.instanceId,
                        ENCHANT_UPGRADE_ROLL,
                        i,
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogBase>
  );
}
