import type { ShopTradeItem } from 'eolib';
import { createPortal } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  FaDollarSign,
  FaHammer,
  FaShoppingBasket,
  FaShoppingCart,
} from 'react-icons/fa';
import type { Client } from '@/client';
import { instanceRarityLabel, type ShopStockItem } from '@/controllers';
import {
  Button,
  ItemIcon,
  rarityBorderClass,
  rarityTextClass,
  Tabs,
} from '@/ui/components';
import { UI_PANEL_BORDER, UI_STICKY_BG } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { useBackdropBlur } from '@/ui/in-game';
import {
  attackSpeedLine,
  formatInstanceBaseStats,
  formatInstanceMod,
  getItemMeta,
  rangeLine,
} from '@/utils';
import { DialogBase } from './dialog-base';

type ShopTabId = 'buy' | 'sell' | 'craft';

function getDisplayName(client: Client, itemId: number): string {
  return (
    client.getEifRecordById(itemId)?.name ??
    client.locale.shared.itemFallbackName.replace('{id}', String(itemId))
  );
}

function getGraphicId(client: Client, itemId: number): number | null {
  return client.getEifRecordById(itemId)?.graphicId ?? null;
}

function ShopStockCard({
  stock,
  canBuy,
  onBuy,
}: {
  stock: ShopStockItem;
  canBuy: boolean;
  onBuy: () => void;
}) {
  const client = useClient();
  const { locale } = useLocale();
  const record = client.getEifRecordById(stock.itemId);
  const graphicId = record?.graphicId ?? null;
  const name =
    record?.name ??
    locale.shared.itemFallbackName.replace('{id}', String(stock.itemId));
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const tooltipLines = (() => {
    const lines = [
      `${name} (${instanceRarityLabel(stock.rarity)})`,
      `Level ${stock.level}`,
    ];
    if (record) lines.push(...formatInstanceBaseStats(record, stock.level));
    for (const m of stock.mods) lines.push(formatInstanceMod(m));
    return lines;
  })();

  const showTooltip = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTooltip({ x: r.right + 8, y: r.top });
  };

  return (
    <div
      ref={ref}
      class={`flex flex-col items-center gap-2 rounded border-2 ${rarityBorderClass(stock.rarity)} bg-base-200 p-2`}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltip(null)}
    >
      <div class='flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-base-content/10 bg-base-300 p-2 lg:h-20 lg:w-20'>
        {graphicId === null ? (
          <div class='h-14 w-14 rounded bg-base-content/10' />
        ) : (
          <ItemIcon
            graphicId={graphicId}
            class='h-12 w-12 object-contain lg:h-16 lg:w-16'
          />
        )}
      </div>
      <p
        class={`wrap-break-word line-clamp-2 w-full text-center font-semibold text-sm ${rarityTextClass(stock.rarity)}`}
      >
        {name}
      </p>
      <p class='text-[10px] tabular-nums opacity-60'>
        Lv{stock.level} · {stock.mods.length} mod
        {stock.mods.length === 1 ? '' : 's'}
      </p>
      <p class='w-full text-center text-base-content/60 text-xs'>
        {locale.shop.buyPrice}: {stock.price.toLocaleString()}
      </p>
      <Button
        variant={['xs', canBuy ? 'primary' : 'disabled']}
        class='w-full'
        onClick={onBuy}
        disabled={!canBuy}
      >
        <FaShoppingCart size={11} />
        {locale.shop.buyAction}
      </Button>
      {tooltip &&
        createPortal(
          <div
            class='pointer-events-none w-max max-w-56 rounded bg-base-300 px-2 py-1 text-xs shadow-lg'
            style={{
              position: 'fixed',
              left: tooltip.x,
              top: tooltip.y,
              zIndex: 9999,
            }}
          >
            {tooltipLines.map((line, i) => (
              <div key={i} class={i === 0 ? 'font-semibold' : 'opacity-70'}>
                {line}
              </div>
            ))}
          </div>,
          document.getElementById('ui') ?? document.body,
        )}
    </div>
  );
}

/** Crafted-item preview: icon + name with a hover tooltip of the item's base
 *  stats — the same content the inventory shows for a plain (un-rolled) item.
 *  Craft outputs are base items, so this uses `getItemMeta`, not the instance
 *  stat path used by `ShopStockCard`. */
function CraftItemPreview({ itemId }: { itemId: number }) {
  const client = useClient();
  const { locale } = useLocale();
  const record = client.getEifRecordById(itemId);
  const graphicId = record?.graphicId ?? null;
  const name =
    record?.name ??
    locale.shared.itemFallbackName.replace('{id}', String(itemId));
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const tooltipLines = (() => {
    if (!record) return [name];
    const lines = [name, ...getItemMeta(record)];
    const speed = attackSpeedLine(client, itemId);
    if (speed) lines.push(speed);
    const range = rangeLine(client, itemId);
    if (range) lines.push(range);
    return lines;
  })();

  const showTooltip = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTooltip({ x: r.right + 8, y: r.top });
  };

  return (
    <div
      ref={ref}
      class='flex flex-col items-center gap-2'
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltip(null)}
    >
      <div class='flex h-22 w-22 shrink-0 items-center justify-center overflow-hidden rounded border border-base-content/10 bg-base-300 p-2'>
        {graphicId === null ? (
          <div class='h-14 w-14 rounded bg-base-content/10' />
        ) : (
          <ItemIcon graphicId={graphicId} class='h-16 w-16 object-contain' />
        )}
      </div>
      <p class='w-full text-center font-semibold text-sm leading-tight'>
        {name}
      </p>
      {tooltip &&
        createPortal(
          <div
            class='pointer-events-none w-max max-w-56 rounded bg-base-300 px-2 py-1 text-xs shadow-lg'
            style={{
              position: 'fixed',
              left: tooltip.x,
              top: tooltip.y,
              zIndex: 9999,
            }}
          >
            {tooltipLines.map((line, i) => (
              <div key={i} class={i === 0 ? 'font-semibold' : 'opacity-70'}>
                {line}
              </div>
            ))}
          </div>,
          document.getElementById('ui') ?? document.body,
        )}
    </div>
  );
}

export function ShopDialog() {
  const client = useClient();
  const { locale } = useLocale();
  const blur = useBackdropBlur();

  const [activeTab, setActiveTab] = useState<ShopTabId>('buy');
  const [shopName, setShopName] = useState(
    () => client.shopController.shopName,
  );
  const [tradeItems, setTradeItems] = useState<ShopTradeItem[]>(
    () => client.shopController.tradeItems,
  );
  // Crafts arrive in the deep FAMILY_SHOP_CRAFT packet AFTER ShopOpen, so unlike
  // before they can't be captured into state at open — they're read live from the
  // controller each render (see `craftItems` below). This tick only forces a
  // re-render when the packet lands (mirrors how the buy tab reads live stock).
  const [, setCraftTick] = useState(0);
  const [inventoryTick, setInventoryTick] = useState(0);
  const [stockTick, setStockTick] = useState(0);

  useEffect(() => {
    const handleOpened = (name: string, newTradeItems: ShopTradeItem[]) => {
      setShopName(name);
      setTradeItems([...newTradeItems]);

      if (newTradeItems.some((i) => i.buyPrice > 0)) {
        setActiveTab('buy');
      } else if (newTradeItems.some((i) => i.sellPrice > 0)) {
        setActiveTab('sell');
      } else {
        setActiveTab('craft');
      }
    };

    const handleChanged = () => {
      setTradeItems([...client.shopController.tradeItems]);
      // Crafts are read live in render; bump the craft tick so an open dialog
      // re-renders when the deep FAMILY_SHOP_CRAFT packet lands.
      setCraftTick((t) => t + 1);
    };

    const handleInventoryChanged = () => {
      setInventoryTick((v) => v + 1);
    };

    const handleStock = () => setStockTick((t) => t + 1);

    client.shopController.subscribeOpened(handleOpened);
    client.shopController.subscribeChanged(handleChanged);
    client.shopController.subscribeStockChanged(handleStock);
    client.inventoryController.subscribeInventoryChanged(
      handleInventoryChanged,
    );

    return () => {
      client.shopController.unsubscribeOpened(handleOpened);
      client.shopController.unsubscribeChanged(handleChanged);
      client.shopController.unsubscribeStockChanged(handleStock);
      client.inventoryController.unsubscribeInventoryChanged(
        handleInventoryChanged,
      );
    };
  }, [client]);

  const goldOnHand = client.inventoryController.goldAmount;

  // Read the craft list live from the controller (see setCraftTick above): any
  // re-render after the deep FAMILY_SHOP_CRAFT packet arrives will show the
  // recipes, so a missed subscription tick can't leave the craft tab stuck empty.
  const craftItems = client.shopController.craftItems;

  const tradeByItemId = useMemo(
    () => new Map(tradeItems.map((item) => [item.itemId, item])),
    [tradeItems],
  );

  // `stockTick` isn't read directly — it's a dependency so a
  // `subscribeStockChanged` push (new rolled stock arriving after the
  // initial ShopOpen) forces this to recompute and the buy tab to
  // re-render with `stockFor(...)` picking up the fresh instances.
  const buyItems = useMemo(
    () => tradeItems.filter((item) => item.buyPrice > 0),
    [tradeItems, stockTick],
  );

  const sellItems = useMemo(
    () =>
      client.inventoryController.items
        .filter(
          (inventoryItem) =>
            (tradeByItemId.get(inventoryItem.id)?.sellPrice ?? 0) > 0,
        )
        .sort((a, b) =>
          getDisplayName(client, a.id).localeCompare(
            getDisplayName(client, b.id),
          ),
        ),
    [client, tradeByItemId, inventoryTick],
  );

  const tabs = [
    {
      id: 'buy',
      label: (
        <span class='flex items-center gap-1'>
          <FaShoppingCart size={11} />
          {locale.shop.tabBuy}
        </span>
      ),
    },
    {
      id: 'sell',
      label: (
        <span class='flex items-center gap-1'>
          <FaDollarSign size={11} />
          {locale.shop.tabSell}
        </span>
      ),
    },
    {
      id: 'craft',
      label: (
        <span class='flex items-center gap-1'>
          <FaHammer size={11} />
          {locale.shop.tabCraft}
        </span>
      ),
    },
  ];

  const title = shopName.trim()
    ? `${locale.shop.title} - ${shopName}`
    : locale.shop.title;

  return (
    <DialogBase id='shop' title={title} size='lg'>
      <div class='flex flex-col'>
        <div
          class={`sticky top-0 z-10 ${UI_PANEL_BORDER} border-b ${UI_STICKY_BG} px-2 pt-1 pb-1 ${blur}`}
        >
          <div class='overflow-x-auto'>
            <Tabs
              name='shop'
              items={tabs}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as ShopTabId)}
              style='border'
              size='xs'
            />
          </div>
        </div>

        {activeTab === 'buy' && (
          <div class='p-2'>
            {buyItems.length === 0 && (
              <p class='py-4 text-center text-base-content/50 text-sm'>
                {locale.shop.buyEmpty}
              </p>
            )}

            <div class='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {buyItems.map((tradeItem) => {
                const maxByGold =
                  tradeItem.buyPrice > 0
                    ? Math.floor(goldOnHand / tradeItem.buyPrice)
                    : 0;
                const maxAmount = Math.min(tradeItem.maxBuyAmount, maxByGold);
                const canBuy = maxAmount > 0;
                const stock = client.shopController.stockFor(tradeItem.itemId);

                if (stock) {
                  return (
                    <ShopStockCard
                      key={`buy-${tradeItem.itemId}`}
                      stock={stock}
                      canBuy={canBuy}
                      onBuy={() =>
                        client.shopController.buyItem(tradeItem.itemId, 1)
                      }
                    />
                  );
                }

                const graphicId = getGraphicId(client, tradeItem.itemId);

                return (
                  <div
                    key={`buy-${tradeItem.itemId}`}
                    class='rounded border border-base-content/10 bg-base-200 p-2'
                  >
                    <div class='flex flex-col items-center gap-2'>
                      <div class='flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-base-content/10 bg-base-300 p-2 lg:h-20 lg:w-20'>
                        {graphicId === null ? (
                          <div class='h-14 w-14 rounded bg-base-content/10' />
                        ) : (
                          <ItemIcon
                            graphicId={graphicId}
                            class='h-12 w-12 object-contain lg:h-16 lg:w-16'
                          />
                        )}
                      </div>
                      <p class='wrap-break-word line-clamp-2 w-full text-center font-semibold text-sm'>
                        {getDisplayName(client, tradeItem.itemId)}
                      </p>
                      <p class='w-full text-center text-base-content/60 text-xs'>
                        {locale.shop.buyPrice}:{' '}
                        {tradeItem.buyPrice.toLocaleString()}
                        <br />
                        {locale.shop.canBuy}: {maxAmount.toLocaleString()}
                      </p>
                      <Button
                        variant={['xs', canBuy ? 'primary' : 'disabled']}
                        class='w-full'
                        onClick={() =>
                          client.shopController.buyItem(
                            tradeItem.itemId,
                            maxAmount,
                          )
                        }
                        disabled={!canBuy}
                      >
                        <FaShoppingCart size={11} />
                        {locale.shop.buyAction}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'sell' && (
          <div class='p-2'>
            {sellItems.length === 0 && (
              <p class='py-4 text-center text-base-content/50 text-sm'>
                {locale.shop.sellEmpty}
              </p>
            )}

            <div class='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {sellItems.map((inventoryItem) => {
                const tradeItem = tradeByItemId.get(inventoryItem.id);
                const graphicId = getGraphicId(client, inventoryItem.id);

                return (
                  <div
                    key={`sell-${inventoryItem.id}`}
                    class='rounded border border-base-content/10 bg-base-200 p-2'
                  >
                    <div class='flex flex-col items-center gap-2'>
                      <div class='flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-base-content/10 bg-base-300 p-2 lg:h-20 lg:w-20'>
                        {graphicId === null ? (
                          <div class='h-14 w-14 rounded bg-base-content/10' />
                        ) : (
                          <ItemIcon
                            graphicId={graphicId}
                            class='h-12 w-12 object-contain lg:h-16 lg:w-16'
                          />
                        )}
                      </div>
                      <p class='wrap-break-word line-clamp-2 w-full text-center font-semibold text-sm'>
                        {getDisplayName(client, inventoryItem.id)}
                      </p>
                      <p class='w-full text-center text-base-content/60 text-xs'>
                        {locale.shop.sellPrice}:{' '}
                        {(tradeItem?.sellPrice ?? 0).toLocaleString()}
                        <br />
                        {locale.shop.youHave}:{' '}
                        {inventoryItem.amount.toLocaleString()}
                      </p>
                      <Button
                        variant={['xs', 'secondary']}
                        class='w-full'
                        onClick={() =>
                          client.shopController.sellItem(
                            inventoryItem.id,
                            inventoryItem.amount,
                          )
                        }
                      >
                        <FaDollarSign size={11} />
                        {locale.shop.sellAction}
                      </Button>
                      <Button
                        variant={['xs', 'outline']}
                        class='w-full'
                        onClick={() =>
                          client.shopController.sellAllItem(inventoryItem.id)
                        }
                      >
                        <FaShoppingBasket size={11} />
                        {locale.shop.sellAllAction}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'craft' && (
          <div class='space-y-1 p-2'>
            {craftItems.length === 0 && (
              <p class='py-4 text-center text-base-content/50 text-sm'>
                {locale.shop.craftEmpty}
              </p>
            )}

            {craftItems.map((craftItem, recipeIndex) => {
              const canCraft = client.shopController.canCraft(craftItem);
              const ingredients = craftItem.ingredients.filter(
                (item) => item.id > 0 && item.amount > 0,
              );

              return (
                <div
                  key={`craft-${recipeIndex}-${craftItem.itemId}`}
                  class='rounded border border-base-content/10 bg-base-200 p-2'
                >
                  <div class='grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3'>
                    <div class='flex flex-col items-center gap-2'>
                      <CraftItemPreview itemId={craftItem.itemId} />
                      <Button
                        variant={['xs', canCraft ? 'accent' : 'disabled']}
                        class='w-full'
                        onClick={() =>
                          client.shopController.craftItem(
                            craftItem.itemId,
                            recipeIndex,
                          )
                        }
                        disabled={!canCraft}
                      >
                        <FaHammer size={11} />
                        {locale.shop.craftAction}
                      </Button>
                    </div>

                    <div class='space-y-1'>
                      <p class='text-base-content/60 text-xs'>
                        {locale.shop.ingredients}
                      </p>
                      {ingredients.length === 0 ? (
                        <p class='text-base-content/50 text-xs'>
                          {locale.shop.noIngredients}
                        </p>
                      ) : (
                        <table class='table-zebra table-xs table w-full rounded border border-base-content/10'>
                          <tbody>
                            {ingredients.map((ingredient, index) => {
                              const owned =
                                client.inventoryController.getItemAmount(
                                  ingredient.id,
                                );
                              const ingredientGraphicId = getGraphicId(
                                client,
                                ingredient.id,
                              );
                              const enough = owned >= ingredient.amount;
                              return (
                                <tr
                                  key={`${craftItem.itemId}-${ingredient.id}-${index}`}
                                >
                                  <td class='w-8'>
                                    <div class='flex h-6 w-6 items-center justify-center overflow-hidden rounded border border-base-content/10 bg-base-300'>
                                      {ingredientGraphicId === null ? (
                                        <div class='h-4 w-4 rounded bg-base-content/10' />
                                      ) : (
                                        <ItemIcon
                                          graphicId={ingredientGraphicId}
                                          class='h-5 w-5 object-contain'
                                        />
                                      )}
                                    </div>
                                  </td>
                                  <td class='truncate'>
                                    {getDisplayName(client, ingredient.id)}
                                  </td>
                                  <td
                                    class={`text-right tabular-nums ${
                                      enough ? 'text-success' : 'text-error'
                                    }`}
                                  >
                                    {owned.toLocaleString()}/
                                    {ingredient.amount.toLocaleString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DialogBase>
  );
}
