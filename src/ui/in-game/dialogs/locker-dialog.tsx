import type { ThreeItem } from 'eolib';
import { createPortal } from 'preact/compat';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import type { IconType } from 'react-icons';
import {
  GiBroadsword,
  GiCubes,
  GiHealthPotion,
  GiScrollQuill,
  GiShield,
} from 'react-icons/gi';
import {
  type InstanceItem,
  InstanceRarity,
  instanceRarityLabel,
} from '@/controllers';
import { playSfxById, SfxId } from '@/sfx';
import { ItemIcon } from '@/ui/components';
import { UI_ITEM_BG, UI_PANEL_BORDER } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { useItemDrag } from '@/ui/in-game';
import {
  formatInstanceBaseStats,
  formatInstanceMod,
  getItemMeta,
  INVENTORY_TAB_COUNT,
  InventoryTab,
  inventoryTabForItemType,
} from '@/utils';
import { DialogBase } from './dialog-base';

const TAB_ICONS: IconType[] = [
  GiBroadsword,
  GiShield,
  GiHealthPotion,
  GiCubes,
  GiScrollQuill,
];

function rarityBorderClass(r: InstanceRarity): string {
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

function rarityTextClass(r: InstanceRarity): string {
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

type StackableLockerCardProps = {
  item: ThreeItem;
  onTake: (itemId: number) => void;
  onTooltipShow: (key: string, x: number, y: number) => void;
  onTooltipHide: (key: string) => void;
};

function StackableLockerCard({
  item,
  onTake,
  onTooltipShow,
  onTooltipHide,
}: StackableLockerCardProps) {
  const client = useClient();
  const { locale } = useLocale();
  const record = client.getEifRecordById(item.id);
  const graphicId = record?.graphicId ?? null;
  const name =
    record?.name ??
    locale.shared.itemFallbackName.replace('{id}', String(item.id));
  const tooltipKey = `stack:${item.id}`;
  const lastTapRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          lastTapRef.current = 0;
          onTake(item.id);
          return;
        }
        lastTapRef.current = now;
        return;
      }
      if (e.button === 0 || e.button === 2) {
        onTake(item.id);
      }
    },
    [item.id, onTake],
  );

  const showTooltip = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const x =
      r.right + 4 + 200 > window.innerWidth ? r.left - 4 - 200 : r.right + 4;
    const y = Math.min(Math.max(r.top, 4), window.innerHeight - 80);
    onTooltipShow(tooltipKey, x, y);
  };

  return (
    <div
      class={`flex cursor-pointer select-none flex-col items-center gap-2 rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} p-2 transition-colors hover:bg-base-content/10 active:bg-base-content/15`}
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={showTooltip}
      onMouseLeave={() => onTooltipHide(tooltipKey)}
    >
      <div
        class={`flex h-14 w-14 items-center justify-center overflow-hidden rounded border ${UI_PANEL_BORDER} bg-base-300 p-1.5 lg:h-16 lg:w-16`}
      >
        {graphicId === null ? (
          <div class='h-10 w-10 rounded bg-base-content/10' />
        ) : (
          <ItemIcon
            graphicId={graphicId}
            alt={name}
            class='h-10 w-10 object-contain lg:h-12 lg:w-12'
          />
        )}
      </div>
      <div class='flex w-full flex-col items-center gap-0.5'>
        <span class='wrap-break-word line-clamp-2 w-full text-center font-medium text-xs leading-tight'>
          {name}
        </span>
        <span class='text-[10px] tabular-nums opacity-60'>
          x{item.amount.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

type InstanceLockerCardProps = {
  inst: InstanceItem;
  onTake: (instanceId: string) => void;
  onTooltipShow: (key: string, x: number, y: number) => void;
  onTooltipHide: (key: string) => void;
};

function InstanceLockerCard({
  inst,
  onTake,
  onTooltipShow,
  onTooltipHide,
}: InstanceLockerCardProps) {
  const client = useClient();
  const { locale } = useLocale();
  const record = client.getEifRecordById(inst.baseItemId);
  const graphicId = record?.graphicId ?? null;
  const name =
    record?.name ??
    locale.shared.itemFallbackName.replace('{id}', String(inst.baseItemId));
  const tooltipKey = `instance:${inst.instanceId}`;
  const lastTapRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          lastTapRef.current = 0;
          onTake(inst.instanceId);
          return;
        }
        lastTapRef.current = now;
        return;
      }
      if (e.button === 0 || e.button === 2) {
        onTake(inst.instanceId);
      }
    },
    [inst.instanceId, onTake],
  );

  const showTooltip = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const x =
      r.right + 4 + 240 > window.innerWidth ? r.left - 4 - 240 : r.right + 4;
    const y = Math.min(Math.max(r.top, 4), window.innerHeight - 100);
    onTooltipShow(tooltipKey, x, y);
  };

  return (
    <div
      class={`flex cursor-pointer select-none flex-col items-center gap-2 rounded border-2 ${rarityBorderClass(inst.rarity)} ${UI_ITEM_BG} p-2 transition-colors hover:bg-base-content/10 active:bg-base-content/15`}
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={showTooltip}
      onMouseLeave={() => onTooltipHide(tooltipKey)}
    >
      <div
        class={`flex h-14 w-14 items-center justify-center overflow-hidden rounded border ${UI_PANEL_BORDER} bg-base-300 p-1.5 lg:h-16 lg:w-16`}
      >
        {graphicId === null ? (
          <div class='h-10 w-10 rounded bg-base-content/10' />
        ) : (
          <ItemIcon
            graphicId={graphicId}
            alt={name}
            class='h-10 w-10 object-contain lg:h-12 lg:w-12'
          />
        )}
      </div>
      <div class='flex w-full flex-col items-center gap-0.5'>
        <span
          class={`wrap-break-word line-clamp-2 w-full text-center font-medium text-xs leading-tight ${rarityTextClass(inst.rarity)}`}
        >
          {name}
        </span>
        <span class='text-[10px] tabular-nums opacity-60'>
          Lv{inst.level} · {inst.mods.length} mod
          {inst.mods.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

export function LockerDialog() {
  const client = useClient();
  const { locale } = useLocale();
  const { currentDrag } = useItemDrag();

  const [activeTab, setActiveTab] = useState<InventoryTab>(
    InventoryTab.Weapons,
  );
  const [items, setItems] = useState<ThreeItem[]>(
    () => client.lockerController.items,
  );
  const [instances, setInstances] = useState<InstanceItem[]>(() =>
    client.instanceController.lockerList(),
  );
  const [tooltip, setTooltip] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const handleItemsChanged = (next: ThreeItem[]) => setItems([...next]);
    const handleInstancesChanged = () =>
      setInstances([...client.instanceController.lockerList()]);
    client.lockerController.subscribeChanged(handleItemsChanged);
    client.instanceController.subscribeChanged(handleInstancesChanged);
    return () => {
      client.lockerController.unsubscribeChanged(handleItemsChanged);
      client.instanceController.unsubscribeChanged(handleInstancesChanged);
    };
  }, [client]);

  const handleTakeStackable = useCallback(
    (itemId: number) => {
      playSfxById(SfxId.InventoryPlace);
      client.lockerController.takeItem(itemId);
    },
    [client],
  );

  const handleTakeInstance = useCallback(
    (instanceId: string) => {
      playSfxById(SfxId.InventoryPlace);
      client.instanceController.sendLockerTake(instanceId);
    },
    [client],
  );

  const itemsByTab = useMemo(() => {
    const buckets: ThreeItem[][] = Array.from(
      { length: INVENTORY_TAB_COUNT },
      () => [],
    );
    for (const item of items) {
      const record = client.getEifRecordById(item.id);
      const tab = record
        ? inventoryTabForItemType(record.type)
        : InventoryTab.Materials;
      buckets[tab].push(item);
    }
    return buckets;
  }, [items, client]);

  const instancesByTab = useMemo(() => {
    const buckets: InstanceItem[][] = Array.from(
      { length: INVENTORY_TAB_COUNT },
      () => [],
    );
    for (const inst of instances) {
      const record = client.getEifRecordById(inst.baseItemId);
      const tab = record
        ? inventoryTabForItemType(record.type)
        : InventoryTab.Materials;
      buckets[tab].push(inst);
    }
    for (const bucket of buckets) {
      bucket.sort((a, b) => b.rarity - a.rarity || b.level - a.level);
    }
    return buckets;
  }, [instances, client]);

  const tabCounts = itemsByTab.map(
    (b, i) => b.length + instancesByTab[i].length,
  );
  const activeItems = itemsByTab[activeTab];
  const activeInstances = instancesByTab[activeTab];
  const isEmpty = activeItems.length === 0 && activeInstances.length === 0;

  const onTooltipShow = useCallback((key: string, x: number, y: number) => {
    setTooltip({ key, x, y });
  }, []);

  const onTooltipHide = useCallback((key: string) => {
    setTooltip((t) => (t?.key === key ? null : t));
  }, []);

  const TAB_LABELS = [
    locale.inventory.tabWeapons,
    locale.inventory.tabArmor,
    locale.inventory.tabConsumables,
    locale.inventory.tabMaterials,
    locale.inventory.tabQuestItems,
  ];

  const isDragTarget = !!currentDrag && currentDrag.source === 'inventory';

  const getTooltipLines = (key: string): string[] => {
    if (key.startsWith('stack:')) {
      const id = Number(key.slice(6));
      const item = items.find((i) => i.id === id);
      const record = item ? client.getEifRecordById(item.id) : undefined;
      if (!item || !record) return [];
      const meta = getItemMeta(record);
      const qty = item.amount > 0 ? ` x${item.amount.toLocaleString()}` : '';
      return [record.name + qty, ...meta];
    }
    if (key.startsWith('instance:')) {
      const id = key.slice(9);
      const inst = instances.find((i) => i.instanceId === id);
      if (!inst) return [];
      const record = client.getEifRecordById(inst.baseItemId);
      const name = record?.name ?? `Item ${inst.baseItemId}`;
      const lines = [
        `${name} (${instanceRarityLabel(inst.rarity)})`,
        `Level ${inst.level}`,
      ];
      if (record) {
        lines.push(...formatInstanceBaseStats(record, inst.level));
      }
      for (const m of inst.mods) {
        lines.push(formatInstanceMod(m));
      }
      return lines;
    }
    return [];
  };

  return (
    <DialogBase id='locker' title={locale.locker.title} size='md' avoidBottom>
      <div class='flex flex-col gap-1'>
        <div class='flex gap-1'>
          <div
            role='tablist'
            aria-orientation='vertical'
            class='flex flex-col gap-1'
          >
            {TAB_LABELS.map((label, index) => {
              const Icon = TAB_ICONS[index];
              const isActive = index === activeTab;
              return (
                <button
                  key={label}
                  type='button'
                  role='tab'
                  aria-selected={isActive}
                  aria-label={`${label} (${tabCounts[index]})`}
                  title={label}
                  onClick={() => setActiveTab(index as InventoryTab)}
                  class={`flex h-11 w-11 flex-col items-center justify-center rounded border transition-colors ${
                    isActive
                      ? `${UI_PANEL_BORDER} bg-primary/20 text-primary`
                      : `${UI_PANEL_BORDER} ${UI_ITEM_BG} text-base-content/70 hover:bg-base-content/10`
                  }`}
                >
                  <Icon size={16} />
                  <span class='text-[10px] tabular-nums leading-tight'>
                    {tabCounts[index]}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            data-locker-drop
            class={`relative flex max-h-72 min-h-48 flex-1 flex-col overflow-hidden rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} transition-colors ${
              isDragTarget ? 'outline-2 outline-primary/40 outline-dashed' : ''
            }`}
          >
            <div
              class={`flex items-center gap-1 border-b ${UI_PANEL_BORDER} px-2 py-1 text-xs`}
            >
              {(() => {
                const Icon = TAB_ICONS[activeTab];
                return <Icon size={11} />;
              })()}
              <span class='font-semibold'>{TAB_LABELS[activeTab]}</span>
              <span class='ml-auto tabular-nums opacity-60'>
                {tabCounts[activeTab]}
              </span>
            </div>
            <div class='flex-1 overflow-y-auto p-2'>
              {isEmpty ? (
                <p class='py-4 text-center text-sm opacity-50'>
                  {locale.locker.empty}
                </p>
              ) : (
                <div class='grid grid-cols-2 gap-2 lg:grid-cols-3'>
                  {activeInstances.map((inst) => (
                    <InstanceLockerCard
                      key={inst.instanceId}
                      inst={inst}
                      onTake={handleTakeInstance}
                      onTooltipShow={onTooltipShow}
                      onTooltipHide={onTooltipHide}
                    />
                  ))}
                  {activeItems.map((item) => (
                    <StackableLockerCard
                      key={item.id}
                      item={item}
                      onTake={handleTakeStackable}
                      onTooltipShow={onTooltipShow}
                      onTooltipHide={onTooltipHide}
                    />
                  ))}
                </div>
              )}
            </div>

            {isDragTarget && (
              <div class='pointer-events-none absolute inset-0 flex items-center justify-center'>
                <span class='rounded bg-primary/20 px-2 py-1 font-semibold text-primary text-xs'>
                  {locale.locker.deposit}
                </span>
              </div>
            )}
          </div>
        </div>

        {tooltip &&
          (() => {
            const lines = getTooltipLines(tooltip.key);
            if (!lines.length) return null;
            return createPortal(
              <div
                class='pointer-events-none w-max max-w-56 rounded bg-base-300 px-2 py-1 text-xs shadow-lg'
                style={{
                  position: 'fixed',
                  left: tooltip.x,
                  top: tooltip.y,
                  zIndex: 9999,
                }}
              >
                {lines.map((line, i) => (
                  <div key={i} class={i === 0 ? 'font-semibold' : 'opacity-70'}>
                    {line}
                  </div>
                ))}
              </div>,
              document.getElementById('ui') ?? document.body,
            );
          })()}
      </div>
    </DialogBase>
  );
}
