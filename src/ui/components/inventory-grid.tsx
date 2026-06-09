import type { Item } from 'eolib';
import { createPortal } from 'preact/compat';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import type { IconType } from 'react-icons';
import { FaCoins, FaTrash } from 'react-icons/fa';
import {
  GiBroadsword,
  GiCubes,
  GiHealthPotion,
  GiScrollQuill,
  GiShield,
} from 'react-icons/gi';
import {
  CombatElement,
  combatElementColor,
  combatElementLabel,
} from '@/combat-overlay';
import { GOLD_ITEM_ID } from '@/consts';
import {
  type InstanceItem,
  InstanceRarity,
  instanceRarityLabel,
} from '@/controllers';
import { playSfxById, SfxId } from '@/sfx';
import { UI_ITEM_BG, UI_PANEL_BORDER } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { SlotType } from '@/ui/enums';
import { useItemDrag } from '@/ui/in-game';
import {
  formatInstanceBaseStats,
  formatInstanceMod,
  getItemMeta,
  INVENTORY_TAB_COUNT,
  InventoryTab,
  inventoryTabForItemType,
} from '@/utils';
import { ItemIcon } from './item-icon';

const TAB_ICONS: IconType[] = [
  GiBroadsword,
  GiShield,
  GiHealthPotion,
  GiCubes,
  GiScrollQuill,
];

const DOUBLE_TAP_MS = 250;
const CARD_SIZE_PX = 56;

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

type JunkDropZoneProps = { zone: 'drop' | 'junk' };

function JunkDropZone({ zone }: JunkDropZoneProps) {
  const { currentDrag } = useItemDrag();
  const { locale } = useLocale();
  const [isOver, setIsOver] = useState(false);
  if (currentDrag?.source !== 'inventory') return null;
  return (
    <div
      data-junk-drop={zone}
      class={`flex h-full cursor-pointer items-center gap-1 whitespace-nowrap rounded border-2 border-dashed px-2 py-0.5 text-xs transition-colors ${isOver ? 'border-error bg-error/20 text-error' : 'border-base-content/20 text-base-content/40'}`}
      onPointerEnter={() => setIsOver(true)}
      onPointerLeave={() => setIsOver(false)}
    >
      <FaTrash size={11} />
      {zone === 'junk'
        ? locale.inventory.junkDropZone
        : locale.inventory.dropZone}
    </div>
  );
}

type StackableCardProps = {
  item: Item;
  isDragging: boolean;
  onPointerDown: (e: PointerEvent, item: Item, target: HTMLElement) => void;
  onTooltipShow: (key: string, x: number, y: number) => void;
  onTooltipHide: (key: string) => void;
};

function StackableCard({
  item,
  isDragging,
  onPointerDown,
  onTooltipShow,
  onTooltipHide,
}: StackableCardProps) {
  const client = useClient();
  const { locale } = useLocale();
  const record = client.getEifRecordById(item.id);
  const graphicId = record?.graphicId ?? null;
  const name =
    record?.name ??
    locale.shared.itemFallbackName.replace('{id}', String(item.id));
  const tooltipKey = `stack:${item.id}`;

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    e.preventDefault();
    onPointerDown(e, item, e.currentTarget as HTMLElement);
  };

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
      data-inventory-item={item.id}
      class={`flex cursor-grab select-none flex-col items-center gap-2 rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} p-2 transition-colors hover:bg-base-content/10 active:bg-base-content/15${isDragging ? ' opacity-30' : ''}`}
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
        {item.amount > 1 && (
          <span class='text-[10px] tabular-nums opacity-60'>
            x{item.amount.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

type InstanceCardProps = {
  inst: InstanceItem;
  isDragging: boolean;
  onPointerDown: (
    e: PointerEvent,
    inst: InstanceItem,
    target: HTMLElement,
  ) => void;
  onTooltipShow: (key: string, x: number, y: number) => void;
  onTooltipHide: (key: string) => void;
};

function InstanceCard({
  inst,
  isDragging,
  onPointerDown,
  onTooltipShow,
  onTooltipHide,
}: InstanceCardProps) {
  const client = useClient();
  const { locale } = useLocale();
  const record = client.getEifRecordById(inst.baseItemId);
  const graphicId = record?.graphicId ?? null;
  const name =
    record?.name ??
    locale.shared.itemFallbackName.replace('{id}', String(inst.baseItemId));
  const tooltipKey = `instance:${inst.instanceId}`;
  const borderClass = rarityBorderClass(inst.rarity);
  const textClass = rarityTextClass(inst.rarity);

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    e.preventDefault();
    onPointerDown(e, inst, e.currentTarget as HTMLElement);
  };

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
      data-instance-item={inst.instanceId}
      class={`flex cursor-grab select-none flex-col items-center gap-2 rounded border-2 ${borderClass} ${UI_ITEM_BG} p-2 transition-colors hover:bg-base-content/10${isDragging ? ' opacity-30' : ''}`}
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
          class={`wrap-break-word line-clamp-2 w-full text-center font-medium text-xs leading-tight ${textClass}`}
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

function InstanceTooltipContent({
  inst,
  lines,
}: {
  inst: InstanceItem;
  lines: string[];
}) {
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} class={i === 0 ? 'font-semibold' : 'opacity-70'}>
          {line}
        </div>
      ))}
      {inst.element !== CombatElement.Plain && (
        <div
          style={{ color: combatElementColor(inst.element), fontSize: '11px' }}
        >
          {combatElementLabel(inst.element)}
        </div>
      )}
    </>
  );
}

/** EquipmentSlot indexes that are the "second" of a two-slot pair. */
const SUB_LOC_1_SLOTS = new Set([10, 12, 14]);

function subLocForSlot(slot: number): number {
  return SUB_LOC_1_SLOTS.has(slot) ? 1 : 0;
}

type Props = {
  /** If provided, only items with these IDs are shown. Defaults to all client items. */
  itemIds?: number[];
};

export function InventoryGrid({ itemIds }: Props) {
  const client = useClient();
  const { locale } = useLocale();
  const { startDrag, currentDrag } = useItemDrag();
  const [activeTab, setActiveTab] = useState<InventoryTab>(
    InventoryTab.Weapons,
  );
  const [, setRefresh] = useState(0);
  const [tooltip, setTooltip] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const target = e.target as HTMLElement;
      if (
        !target.closest('[data-inventory-item]') &&
        !target.closest('[data-instance-item]')
      ) {
        setTooltip(null);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    const handler = () => setRefresh((n) => n + 1);
    client.inventoryController.subscribeInventoryChanged(handler);
    client.instanceController.subscribeChanged(handler);
    client.tradeController.subscribe(handler);
    return () => {
      client.inventoryController.unsubscribeInventoryChanged(handler);
      client.instanceController.unsubscribeChanged(handler);
      client.tradeController.unsubscribe(handler);
    };
  }, [client]);

  const visibleItems = useMemo((): Item[] => {
    const source = itemIds
      ? client.inventoryController.items.filter((i) => itemIds.includes(i.id))
      : client.inventoryController.items;
    return source.filter((i) => i.id !== GOLD_ITEM_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, itemIds, currentDrag]);

  const visibleInstances = useMemo((): InstanceItem[] => {
    // Inventory grid shows un-equipped, un-lockered instances — and
    // excludes anything the player has offered into a trade so the
    // same card doesn't appear in both inventory and trade panes.
    const all = client.instanceController.inventoryList();
    const inTrade = client.tradeController.playerOfferedInstanceIds();
    const filtered = all.filter((i) => !inTrade.has(i.instanceId));
    return itemIds
      ? filtered.filter((i) => itemIds.includes(i.baseItemId))
      : filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, itemIds, currentDrag]);

  const itemsByTab = useMemo(() => {
    const buckets: Item[][] = Array.from(
      { length: INVENTORY_TAB_COUNT },
      () => [],
    );
    for (const item of visibleItems) {
      const record = client.getEifRecordById(item.id);
      const tab = record
        ? inventoryTabForItemType(record.type)
        : InventoryTab.Materials;
      buckets[tab].push(item);
    }
    return buckets;
  }, [visibleItems, client]);

  const instancesByTab = useMemo(() => {
    const buckets: InstanceItem[][] = Array.from(
      { length: INVENTORY_TAB_COUNT },
      () => [],
    );
    for (const inst of visibleInstances) {
      const record = client.getEifRecordById(inst.baseItemId);
      const tab = record
        ? inventoryTabForItemType(record.type)
        : InventoryTab.Materials;
      buckets[tab].push(inst);
    }
    // Show higher-rarity instances first; level breaks ties.
    for (const bucket of buckets) {
      bucket.sort((a, b) => b.rarity - a.rarity || b.level - a.level);
    }
    return buckets;
  }, [visibleInstances, client]);

  const tabCounts = itemsByTab.map(
    (b, i) => b.length + instancesByTab[i].length,
  );
  const activeItems = itemsByTab[activeTab];
  const activeInstances = instancesByTab[activeTab];
  const goldAmount = client.inventoryController.goldAmount;

  const getCoords = () => {
    const p = client.getPlayerCharacter();
    return p ? { x: p.coords.x, y: p.coords.y } : { x: 0, y: 0 };
  };

  const handleItemPointerDown = useCallback(
    (e: PointerEvent, item: Item, target: HTMLElement) => {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        client.inventoryController.useItem(item.id);
        return;
      }
      lastTapRef.current = now;

      const rect = target.getBoundingClientRect();
      const record = client.getEifRecordById(item.id);
      if (!record) return;

      let longPressTimer: ReturnType<typeof setTimeout> | null = null;
      if (e.pointerType === 'touch') {
        const tooltipX = Math.min(rect.right + 4, window.innerWidth - 168);
        const tooltipY = Math.max(4, rect.top);
        setTooltip({ key: `stack:${item.id}`, x: tooltipX, y: tooltipY });
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          setTooltip(null);
        }, 700);
      } else {
        setTooltip(null);
      }

      playSfxById(SfxId.InventoryPickup);

      startDrag({
        element: target,
        info: {
          source: 'inventory',
          itemId: item.id,
          pointerId: e.pointerId,
          ghostX: e.clientX,
          ghostY: e.clientY,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          graphicId: record.graphicId,
          ghostWidth: CARD_SIZE_PX,
          ghostHeight: CARD_SIZE_PX,
        },
        onMove: (mx, my) => {
          if (
            longPressTimer &&
            Math.hypot(mx - e.clientX, my - e.clientY) > 5
          ) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          setTooltip(null);
          if (client.app) {
            const canvas = client.app.renderer.canvas;
            const canvasRect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / canvasRect.width;
            const scaleY = canvas.height / canvasRect.height;
            client.setMousePosition({
              x: Math.min(
                Math.max(Math.floor((mx - canvasRect.left) * scaleX), 0),
                canvas.width,
              ),
              y: Math.min(
                Math.max(Math.floor((my - canvasRect.top) * scaleY), 0),
                canvas.height,
              ),
            });
          }
        },
        onResolve: (result) => {
          playSfxById(SfxId.InventoryPlace);
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          if (result.type === 'cancelled') return;
          if (result.type === 'cell' || result.type === 'tab') {
            return;
          }
          if (result.type === 'equip-slot') {
            client.inventoryController.equipItem(result.slot, item.id);
          } else if (result.type === 'hotbar-slot') {
            client.hotbarController.setSlot(result.index, {
              type: SlotType.Item,
              typeId: item.id,
            });
          } else if (result.type === 'ground') {
            if (!client.mapController.cursorInDropRange()) return;
            const coords = client.mouseCoords ?? getCoords();
            client.inventoryController.dropItem(item.id, coords);
          } else if (result.type === 'junk') {
            client.inventoryController.junkItem(item.id);
          } else if (result.type === 'drop') {
            const coords = client.getPlayerCharacter()?.coords;
            if (coords) client.inventoryController.dropItem(item.id, coords);
          } else if (result.type === 'chest') {
            client.chestController.addItem(item.id);
          } else if (result.type === 'locker') {
            client.lockerController.addItem(item.id);
          } else if (result.type === 'trade') {
            const invItem = client.inventoryController.getItemById(item.id);
            if (!invItem) return;
            if (invItem.amount > 1) {
              const itemName =
                client.getEifRecordById(item.id)?.name ?? String(item.id);
              client.alertController.showAmount(
                locale.trade.dropHowMany,
                itemName,
                invItem.amount,
                locale.trade.drop,
                (amount) => {
                  if (amount !== null && amount > 0) {
                    client.tradeController.addItem(item.id, amount);
                  }
                },
              );
            } else {
              client.tradeController.addItem(item.id, 1);
            }
          }
        },
      });
    },
    [client, locale, startDrag],
  );

  const handleInstancePointerDown = useCallback(
    (e: PointerEvent, inst: InstanceItem, target: HTMLElement) => {
      const rect = target.getBoundingClientRect();
      const record = client.getEifRecordById(inst.baseItemId);
      const graphicId = record?.graphicId ?? 0;
      playSfxById(SfxId.InventoryPickup);
      setTooltip(null);
      startDrag({
        element: target,
        info: {
          source: 'inventory',
          itemId: inst.baseItemId,
          instanceId: inst.instanceId,
          pointerId: e.pointerId,
          ghostX: e.clientX,
          ghostY: e.clientY,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          graphicId,
          ghostWidth: CARD_SIZE_PX,
          ghostHeight: CARD_SIZE_PX,
        },
        onResolve: (result) => {
          playSfxById(SfxId.InventoryPlace);
          if (result.type === 'cancelled') return;
          if (result.type === 'equip-slot') {
            client.instanceController.sendEquip(
              inst.instanceId,
              subLocForSlot(result.slot),
            );
          } else if (result.type === 'locker') {
            client.instanceController.sendLockerDeposit(inst.instanceId);
          } else if (result.type === 'chest') {
            client.instanceController.sendChestDeposit(inst.instanceId);
          } else if (result.type === 'trade') {
            client.instanceController.sendTradeAdd(inst.instanceId);
          }
          // Other drop targets (junk / drop / ground) are stackable-
          // only — dropping rolled gear onto the ground would need a
          // roll-time policy call (probably scrap-for-gold).
        },
      });
    },
    [client, startDrag],
  );

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

  const getTooltipLines = (key: string): string[] => {
    if (key.startsWith('stack:')) {
      const id = Number(key.slice(6));
      const item = visibleItems.find((i) => i.id === id);
      const record = item ? client.getEifRecordById(item.id) : undefined;
      if (!item || !record) return [];
      const meta = getItemMeta(record);
      const qty = item.amount > 1 ? ` x${item.amount.toLocaleString()}` : '';
      return [record.name + qty, ...meta];
    }
    if (key.startsWith('instance:')) {
      const id = key.slice(9);
      const inst = visibleInstances.find((i) => i.instanceId === id);
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

  const isEmpty = activeItems.length === 0 && activeInstances.length === 0;

  return (
    <div class='flex flex-col gap-1'>
      <div class='flex items-center justify-between gap-1 px-1'>
        <div class='flex items-center gap-1 text-warning text-xs'>
          <FaCoins size={11} />
          <span class='font-semibold tabular-nums'>
            {goldAmount.toLocaleString()}
          </span>
        </div>
        <div class='flex items-center gap-1'>
          <JunkDropZone zone='drop' />
          <JunkDropZone zone='junk' />
        </div>
      </div>

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
          class={`flex max-h-72 min-h-48 flex-1 flex-col overflow-hidden rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG}`}
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
                {locale.inventory.empty}
              </p>
            ) : (
              <div class='grid grid-cols-2 gap-2 lg:grid-cols-3'>
                {activeInstances.map((inst) => (
                  <InstanceCard
                    key={inst.instanceId}
                    inst={inst}
                    isDragging={
                      currentDrag?.source === 'inventory' &&
                      currentDrag?.instanceId === inst.instanceId
                    }
                    onPointerDown={handleInstancePointerDown}
                    onTooltipShow={onTooltipShow}
                    onTooltipHide={onTooltipHide}
                  />
                ))}
                {activeItems.map((item) => (
                  <StackableCard
                    key={item.id}
                    item={item}
                    isDragging={
                      currentDrag?.source === 'inventory' &&
                      currentDrag.itemId === item.id
                    }
                    onPointerDown={handleItemPointerDown}
                    onTooltipShow={onTooltipShow}
                    onTooltipHide={onTooltipHide}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {tooltip &&
        (() => {
          const lines = getTooltipLines(tooltip.key);
          if (!lines.length) return null;
          const isInstance = tooltip.key.startsWith('instance:');
          const instId = isInstance ? tooltip.key.slice(9) : null;
          const inst = instId
            ? visibleInstances.find((i) => i.instanceId === instId)
            : null;
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
              {inst ? (
                <InstanceTooltipContent inst={inst} lines={lines} />
              ) : (
                lines.map((line, i) => (
                  <div key={i} class={i === 0 ? 'font-semibold' : 'opacity-70'}>
                    {line}
                  </div>
                ))
              )}
            </div>,
            document.getElementById('ui') ?? document.body,
          );
        })()}
    </div>
  );
}
