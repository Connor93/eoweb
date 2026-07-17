import { useEffect, useState } from 'preact/hooks';
import { instanceRarityLabel } from '@/controllers';
import { ItemIcon, rarityBorderClass, rarityTextClass } from '@/ui/components';
import { UI_ITEM_BG, UI_PANEL_BORDER } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { useItemDrag } from '@/ui/in-game';
import { formatInstanceMod } from '@/utils';
import { DialogBase } from './dialog-base';

/**
 * Enchanter dialog shell — registration + drag-to-select only (Task 8).
 * Selection is purely client-side (`EnchanterController.selectInstance`):
 * dragging an inventory instance onto the `[data-enchanter-drop]` slot
 * loads it into the window for inspection. There is no server deposit,
 * unlike chest/locker/trade — the instance never leaves the inventory.
 * Operation buttons (upgrade rarity / reroll / upgrade roll) land in
 * Task 9.
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
    return () => {
      client.enchanterController.unsubscribeChanged(bump);
      client.instanceController.unsubscribeChanged(bump);
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

        {inst && inst.mods.length > 0 && (
          <ul class='flex flex-col gap-1'>
            {inst.mods.map((mod, i) => (
              <li
                key={i}
                class={`rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} px-2 py-1 text-xs`}
              >
                {formatInstanceMod(mod)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogBase>
  );
}
