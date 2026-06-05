import type { Item } from 'eolib';
import { createPortal } from 'preact/compat';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import { FaCoins, FaTrash } from 'react-icons/fa';
import { GOLD_ITEM_ID } from '@/consts';
import { playSfxById, SfxId } from '@/sfx';
import { UI_ITEM_BG, UI_PANEL_BORDER } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { SlotType } from '@/ui/enums';
import { useItemDrag } from '@/ui/in-game';
import {
  getItemMeta,
  INVENTORY_TAB_COUNT,
  InventoryTab,
  inventoryTabForItemType,
} from '@/utils';
import { ItemIcon } from './item-icon';
import { Tabs } from './tabs';

const DOUBLE_TAP_MS = 250;
const CARD_SIZE_PX = 56;

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

type InventoryItemCardProps = {
  item: Item;
  isDragging: boolean;
  onPointerDown: (e: PointerEvent, item: Item, target: HTMLElement) => void;
  onTooltipShow: (id: number, x: number, y: number) => void;
  onTooltipHide: (id: number) => void;
};

function InventoryItemCard({
  item,
  isDragging,
  onPointerDown,
  onTooltipShow,
  onTooltipHide,
}: InventoryItemCardProps) {
  const client = useClient();
  const { locale } = useLocale();
  const record = client.getEifRecordById(item.id);
  const graphicId = record?.graphicId ?? null;
  const name =
    record?.name ??
    locale.shared.itemFallbackName.replace('{id}', String(item.id));

  const slotRef = useRef<HTMLDivElement>(null);

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
    onTooltipShow(item.id, x, y);
  };

  return (
    <div
      ref={slotRef}
      data-inventory-item={item.id}
      /* biome-ignore lint/nursery/useSortedClasses: Need space */
      class={`flex cursor-grab select-none flex-col items-center gap-2 rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} p-2 transition-colors hover:bg-base-content/10 active:bg-base-content/15${isDragging ? ' opacity-30' : ''}`}
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={showTooltip}
      onMouseLeave={() => onTooltipHide(item.id)}
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
    id: number;
    x: number;
    y: number;
  } | null>(null);
  const lastTapRef = useRef(0);

  // Clear tooltip when touching outside an inventory item
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!(e.target as HTMLElement).closest('[data-inventory-item]')) {
        setTooltip(null);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    const handler = () => setRefresh((n) => n + 1);
    client.inventoryController.subscribeInventoryChanged(handler);
    return () =>
      client.inventoryController.unsubscribeInventoryChanged(handler);
  }, [client]);

  const visibleItems = useMemo((): Item[] => {
    const source = itemIds
      ? client.inventoryController.items.filter((i) => itemIds.includes(i.id))
      : client.inventoryController.items;
    return source.filter((i) => i.id !== GOLD_ITEM_ID);
    // currentDrag included so the dragging-opacity recomputes; setRefresh
    // re-runs the memo on inventory changes
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

  const tabCounts = itemsByTab.map((b) => b.length);
  const activeItems = itemsByTab[activeTab];
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
        setTooltip({ id: item.id, x: tooltipX, y: tooltipY });
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
            // List-style inventory: no manual re-tabbing, no spatial slots.
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

  const onTooltipShow = useCallback((id: number, x: number, y: number) => {
    setTooltip({ id, x, y });
  }, []);

  const onTooltipHide = useCallback((id: number) => {
    setTooltip((t) => (t?.id === id ? null : t));
  }, []);

  const TAB_LABELS = [
    locale.inventory.tabWeapons,
    locale.inventory.tabArmor,
    locale.inventory.tabConsumables,
    locale.inventory.tabMaterials,
    locale.inventory.tabQuestItems,
  ];

  const getTooltipLines = (item: Item): string[] => {
    const record = client.getEifRecordById(item.id);
    if (!record) return [];
    const meta = getItemMeta(record);
    const qty = item.amount > 1 ? ` x${item.amount.toLocaleString()}` : '';
    return [record.name + qty, ...meta];
  };

  return (
    <div class='flex flex-col gap-1'>
      {/* Header: gold counter + junk/drop zones (shown only while dragging) */}
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

      {/* Tabs — auto-derived from item type, not drop targets */}
      <Tabs
        name='inventory-tabs'
        items={TAB_LABELS.map((label, index) => ({
          id: index.toString(),
          label: `${label} (${tabCounts[index]})`,
        }))}
        activeId={activeTab.toString()}
        onSelect={(id) => setActiveTab(Number(id) as InventoryTab)}
        style='border'
        size='sm'
      />

      {/* Card grid for active tab */}
      <div class='max-h-72 min-h-24 overflow-y-auto p-2'>
        {activeItems.length === 0 ? (
          <p class='py-4 text-center text-sm opacity-50'>
            {locale.inventory.empty}
          </p>
        ) : (
          <div class='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'>
            {activeItems.map((item) => (
              <InventoryItemCard
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

      {/* Tooltip portal — avoids scroll/clip issues inside dialogs */}
      {tooltip &&
        (() => {
          const item = visibleItems.find((i) => i.id === tooltip.id);
          const lines = item ? getTooltipLines(item) : [];
          if (!lines.length) return null;
          return createPortal(
            <div
              class='pointer-events-none w-max max-w-48 rounded bg-base-300 px-2 py-1 text-xs shadow-lg'
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
  );
}
