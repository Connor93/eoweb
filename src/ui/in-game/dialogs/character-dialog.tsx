import type { CharacterDetails, EifRecord } from 'eolib';
import { StatId } from 'eolib';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import { FaArrowUp } from 'react-icons/fa';
import {
  CombatElement,
  combatElementColor,
  combatElementLabel,
} from '@/combat-overlay';
import {
  type CharacterTab,
  type InstanceItem,
  InstanceRarity,
  instanceRarityLabel,
} from '@/controllers';
import { EquipmentSlot } from '@/equipment';
import { playSfxById, SfxId } from '@/sfx';
import {
  BreakdownTooltip,
  Button,
  ItemIcon,
  QuestBookList,
  Tabs,
} from '@/ui/components';
import { UI_PANEL_BORDER, UI_STICKY_BG } from '@/ui/consts';
import { useCharacterInfo, useClient, useLocale } from '@/ui/context';
import { useBackdropBlur, useItemDrag, usePlayerStats } from '@/ui/in-game';
import {
  attackSpeedLine,
  capitalize,
  classicEquipsFromPaperdoll,
  computeEffects,
  computeGearBreakdown,
  formatInstanceBaseStats,
  formatInstanceMod,
  getItemMeta,
  type StatRowKey,
} from '@/utils';
import { DialogBase } from './dialog-base';

const EQUIP_CELL = 23;

function getEquipTooltipLines(
  record: EifRecord,
  speedLine: string | null,
): string[] {
  return [
    record.name,
    ...(speedLine ? [speedLine] : []),
    ...getItemMeta(record),
  ];
}

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

function getInstanceTooltipLines(
  inst: InstanceItem,
  record: EifRecord | null | undefined,
  speedLine: string | null,
): string[] {
  const name = record?.name ?? `Item ${inst.baseItemId}`;
  const lines = [
    `${name} (${instanceRarityLabel(inst.rarity)})`,
    `Level ${inst.level}`,
  ];
  if (speedLine) {
    lines.push(speedLine);
  }
  if (record) {
    lines.push(...formatInstanceBaseStats(record, inst.level));
  }
  for (const m of inst.mods) {
    lines.push(formatInstanceMod(m));
  }
  return lines;
}

type SlotConfig = {
  key: string;
  label: string;
  itemId: number;
  slot: EquipmentSlot;
  gridColumn: string;
  gridRow: string;
};

function EquipSlot({ label, itemId, slot, gridColumn, gridRow }: SlotConfig) {
  const client = useClient();
  const info = useCharacterInfo();
  const { startDrag, cancelDrag } = useItemDrag();
  const [, setRefresh] = useState(0);
  const isOwnCharacter = info?.details.playerId === client.playerId;

  // Re-render when the instance controller's snapshot changes so a
  // freshly equipped instance picks up the rarity tint immediately.
  useEffect(() => {
    if (!isOwnCharacter) return;
    const handler = () => setRefresh((n) => n + 1);
    client.instanceController.subscribeChanged(handler);
    return () => client.instanceController.unsubscribeChanged(handler);
  }, [client, isOwnCharacter]);

  // Equipped instance occupying this slot, if any.
  const equippedInstance = isOwnCharacter
    ? client.instanceController.equippedAtSlot(slot)
    : undefined;

  const record = itemId ? client.getEifRecordById(itemId) : null;
  // itemId is the slot's base item id for both plain and instanced equips, so
  // it keys the authored weapon swing speed for either case.
  const speedLine = itemId ? attackSpeedLine(client, itemId) : null;
  const tooltipLines = equippedInstance
    ? getInstanceTooltipLines(equippedInstance, record, speedLine)
    : record
      ? getEquipTooltipLines(record, speedLine)
      : null;
  const rarityBorder = equippedInstance
    ? rarityBorderClass(equippedInstance.rarity)
    : null;
  const [touchTooltip, setTouchTooltip] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  // Clear touch tooltip when touching outside this slot
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!slotRef.current?.contains(e.target as Node)) {
        setTouchTooltip(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const doUnequip = () => {
    if (equippedInstance) {
      client.instanceController.sendUnequip(equippedInstance.instanceId);
    } else {
      client.inventoryController.unequipItem(slot);
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!record || !itemId) return;
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    e.preventDefault();

    if (e.pointerType === 'touch') {
      setTouchTooltip(true);
    }

    if (!isOwnCharacter) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Long-press on touch: cancel drag and unequip
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    if (e.pointerType === 'touch') {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        cancelDrag();
        setTouchTooltip(false);
        doUnequip();
      }, 700);
    }

    playSfxById(SfxId.InventoryPickup);

    startDrag({
      element: e.currentTarget as Element,
      info: {
        source: 'equipment',
        itemId,
        equipSlot: slot,
        pointerId: e.pointerId,
        ghostX: e.clientX,
        ghostY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        graphicId: record.graphicId,
        ghostWidth: rect.width,
        ghostHeight: rect.height,
      },
      onResolve: (result) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (result.type !== 'cancelled') {
          doUnequip();
        }
      },
    });
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (!record || !itemId || !isOwnCharacter) return;
    doUnequip();
  };

  // Rarity border wins over the default primary tint when an instance
  // is equipped here.
  const itemBorder = rarityBorder ?? 'border-primary/30 bg-primary/5';

  return (
    <div
      ref={slotRef}
      data-equip-slot={isOwnCharacter ? slot : undefined}
      class={`group relative flex items-center justify-center rounded border-2 ${itemId ? itemBorder : UI_PANEL_BORDER}${isOwnCharacter && itemId ? ' cursor-grab' : ''}`}
      style={{ gridColumn, gridRow }}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    >
      {record ? (
        <ItemIcon
          graphicId={record.graphicId}
          alt={record.name}
          class='pointer-events-none h-full w-full object-contain'
        />
      ) : (
        <span class='pointer-events-none text-center text-[7px] text-base-content/40 leading-tight'>
          {label}
        </span>
      )}
      {tooltipLines && tooltipLines.length > 0 && (
        <div
          class={`pointer-events-none absolute top-0 left-full z-50 ml-1 w-max max-w-40 rounded bg-base-300 px-2 py-1 text-xs shadow-lg ${touchTooltip ? 'block' : 'hidden group-hover:block'}`}
        >
          {/* Layout: name (line 0) → element row (if instance is non-Plain) → rest. */}
          {tooltipLines[0] !== undefined && (
            <div class='font-semibold'>{tooltipLines[0]}</div>
          )}
          {equippedInstance &&
            equippedInstance.element !== CombatElement.Plain && (
              <div
                style={{
                  color: combatElementColor(equippedInstance.element),
                  fontSize: '11px',
                }}
              >
                {combatElementLabel(equippedInstance.element)}
              </div>
            )}
          {tooltipLines.slice(1).map((line, i) => (
            <div key={i} class='opacity-70'>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaperdollTab() {
  const info = useCharacterInfo();
  const { locale } = useLocale();

  const slots: SlotConfig[] = [
    {
      key: 'hat',
      label: locale.equipment.hat,
      itemId: info?.equipment?.hat ?? 0,
      slot: EquipmentSlot.Hat,
      gridColumn: '3 / span 2',
      gridRow: '1 / span 2',
    },
    {
      key: 'necklace',
      label: locale.equipment.necklace,
      itemId: info?.equipment?.necklace ?? 0,
      slot: EquipmentSlot.Necklace,
      gridColumn: '5 / span 2',
      gridRow: '1 / span 2',
    },
    {
      key: 'weapon',
      label: locale.equipment.weapon,
      itemId: info?.equipment?.weapon ?? 0,
      slot: EquipmentSlot.Weapon,
      gridColumn: '1 / span 2',
      gridRow: '3 / span 3',
    },
    {
      key: 'armor',
      label: locale.equipment.armor,
      itemId: info?.equipment?.armor ?? 0,
      slot: EquipmentSlot.Armor,
      gridColumn: '3 / span 2',
      gridRow: '3 / span 3',
    },
    {
      key: 'shield',
      label: locale.equipment.shield,
      itemId: info?.equipment?.shield ?? 0,
      slot: EquipmentSlot.Shield,
      gridColumn: '5 / span 2',
      gridRow: '3 / span 3',
    },
    {
      key: 'gloves',
      label: locale.equipment.gloves,
      itemId: info?.equipment?.gloves ?? 0,
      slot: EquipmentSlot.Gloves,
      gridColumn: '1 / span 2',
      gridRow: '6 / span 2',
    },
    {
      key: 'belt',
      label: locale.equipment.belt,
      itemId: info?.equipment?.belt ?? 0,
      slot: EquipmentSlot.Belt,
      gridColumn: '3 / span 2',
      gridRow: '6',
    },
    {
      key: 'ring1',
      label: locale.equipment.ring1,
      itemId: info?.equipment?.ring[0] ?? 0,
      slot: EquipmentSlot.Ring1,
      gridColumn: '5',
      gridRow: '6',
    },
    {
      key: 'ring2',
      label: locale.equipment.ring2,
      itemId: info?.equipment?.ring[1] ?? 0,
      slot: EquipmentSlot.Ring2,
      gridColumn: '6',
      gridRow: '6',
    },
    {
      key: 'armlet1',
      label: locale.equipment.armlet1,
      itemId: info?.equipment?.armlet[0] ?? 0,
      slot: EquipmentSlot.Armlet1,
      gridColumn: '5',
      gridRow: '7',
    },
    {
      key: 'armlet2',
      label: locale.equipment.armlet2,
      itemId: info?.equipment?.armlet[1] ?? 0,
      slot: EquipmentSlot.Armlet2,
      gridColumn: '6',
      gridRow: '7',
    },
    {
      key: 'boots',
      label: locale.equipment.boots,
      itemId: info?.equipment?.boots ?? 0,
      slot: EquipmentSlot.Boots,
      gridColumn: '3 / span 2',
      gridRow: '7 / span 2',
    },
    {
      key: 'accessory',
      label: locale.equipment.accessory,
      itemId: info?.equipment?.accessory ?? 0,
      slot: EquipmentSlot.Accessory,
      gridColumn: '2',
      gridRow: '8',
    },
    {
      key: 'bracer1',
      label: locale.equipment.bracer1,
      itemId: info?.equipment?.bracer[0] ?? 0,
      slot: EquipmentSlot.Bracer1,
      gridColumn: '5',
      gridRow: '8',
    },
    {
      key: 'bracer2',
      label: locale.equipment.bracer2,
      itemId: info?.equipment?.bracer[1] ?? 0,
      slot: EquipmentSlot.Bracer2,
      gridColumn: '6',
      gridRow: '8',
    },
  ];

  const infoRows: [string, string][] = [
    [locale.character.labelName, info ? capitalize(info.details.name) : '—'],
    [locale.character.labelHome, info ? info.details.home : '—'],
    [locale.character.labelClass, info ? info.className : '—'],
    [
      locale.character.labelPartner,
      info?.details.partner ? capitalize(info.details.partner) : '—',
    ],
    [locale.character.labelTitle, info?.details.title || '—'],
    [locale.character.labelGuild, info?.details.guild || '—'],
    [locale.character.labelRank, info?.details.guildRank || '—'],
  ];

  return (
    <div class='flex gap-3'>
      {/* Equipment grid (left) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(6, ${EQUIP_CELL}px)`,
          gridTemplateRows: `repeat(8, ${EQUIP_CELL}px)`,
          gap: 2,
        }}
      >
        {slots.map(({ key, ...rest }) => (
          <EquipSlot key={key} {...rest} />
        ))}
      </div>

      {/* Character info (right) */}
      <div class='flex min-w-0 flex-1 flex-col gap-0.5 text-sm'>
        {infoRows.map(([label, value]) => (
          <div key={label} class='flex justify-between gap-2'>
            <span class='shrink-0 text-primary/60'>{label}</span>
            <span class='min-w-0 truncate font-medium'>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const GROUP_HEADER_CLASS: Record<string, string> = {
  offense: 'text-error/80',
  defense: 'text-info/80',
  utility: 'text-secondary/80',
};

const elementFromName: Record<string, CombatElement> = {
  fire: CombatElement.Fire,
  water: CombatElement.Water,
  earth: CombatElement.Earth,
  wind: CombatElement.Wind,
  light: CombatElement.Light,
  dark: CombatElement.Dark,
};

function EffectsSection() {
  const client = useClient();
  const { locale } = useLocale();
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const handler = () => setRev((n) => n + 1);
    client.instanceController.subscribeChanged(handler);
    return () => client.instanceController.unsubscribeChanged(handler);
  }, [client]);

  const groups = useMemo(() => {
    const equipped = client.instanceController
      .list()
      .filter((i) => i.equippedSlot >= 0);
    return computeEffects(equipped, (id) =>
      id ? (client.getEifRecordById(id) ?? null) : null,
    );
  }, [client, rev]);

  const groupLabel: Record<string, string> = {
    offense: locale.stats.groupOffense,
    defense: locale.stats.groupDefense,
    utility: locale.stats.groupUtility,
  };

  return (
    <div class='flex flex-col gap-0.5 border-base-content/10 border-t pt-2'>
      <span class='text-primary/60 text-xs uppercase tracking-wide'>
        {locale.stats.labelEffects}
      </span>
      {groups.length === 0 && (
        <span class='text-base-content/40 text-xs'>
          {locale.stats.effectsEmpty}
        </span>
      )}
      {groups.map((g) => (
        <div key={g.group}>
          <div class={`text-xs ${GROUP_HEADER_CLASS[g.group]}`}>
            {groupLabel[g.group]}
          </div>
          {g.lines.map((line, i) => (
            // Index disambiguates the rare same-label+condition pair
            // (two mod kinds on one target render as separate lines).
            <div key={`${line.label}|${line.condition}|${i}`} class='pl-2'>
              <BreakdownTooltip sources={line.sources}>
                <span
                  class='text-xs'
                  style={
                    line.element
                      ? {
                          color: combatElementColor(
                            elementFromName[line.element] ??
                              CombatElement.Plain,
                          ),
                        }
                      : undefined
                  }
                >
                  <span class='text-success'>{line.valueText}</span>{' '}
                  {line.label}
                  {line.condition && (
                    <span class='opacity-50'> ({line.condition})</span>
                  )}
                </span>
              </BreakdownTooltip>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StatsTab() {
  const client = useClient();
  const { locale } = useLocale();
  const info = useCharacterInfo();
  const blur = useBackdropBlur();
  const {
    baseStats: base,
    secondaryStats: secondary,
    statPoints,
    maxHp,
    maxTp,
  } = usePlayerStats();

  const isOwnCharacter = info?.details.playerId === client.playerId;
  const canTrain = isOwnCharacter && statPoints > 0;

  const handleTrain = useCallback(
    (statId: StatId) => {
      client.statSkillController.trainStat(statId);
    },
    [client],
  );

  const statPointsLabel = locale.stats.statPoints.replace(
    '{count}',
    String(statPoints),
  );

  const [instanceRev, setInstanceRev] = useState(0);
  useEffect(() => {
    if (!isOwnCharacter) return;
    const handler = () => setInstanceRev((n) => n + 1);
    client.instanceController.subscribeChanged(handler);
    return () => client.instanceController.unsubscribeChanged(handler);
  }, [client, isOwnCharacter]);

  const [equipRev, setEquipRev] = useState(0);
  useEffect(() => {
    if (!isOwnCharacter) return;
    const handler = () => setEquipRev((n) => n + 1);
    client.inventoryController.subscribeEquipmentChanged(handler);
    return () =>
      client.inventoryController.unsubscribeEquipmentChanged(handler);
  }, [client, isOwnCharacter]);

  const breakdown = useMemo(() => {
    if (!isOwnCharacter) return null;
    const equipped = client.instanceController
      .list()
      .filter((i) => i.equippedSlot >= 0);
    return computeGearBreakdown(
      equipped,
      classicEquipsFromPaperdoll(client.equipment),
      (id) => client.getEifRecordById(id) ?? null,
    );
    // instanceRev / equipRev are the change signals; secondary/base stats refresh via usePlayerStats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isOwnCharacter, instanceRev, equipRev]);

  const statRow = (key: StatRowKey, total: number, display?: string) => {
    if (!isOwnCharacter || !breakdown) {
      return <span>{display ?? total.toLocaleString()}</span>;
    }
    const b = breakdown[key];
    const base = total - b.gearTotal;
    return (
      <BreakdownTooltip
        baseLabel={locale.stats.labelBaseClassLevel}
        baseValue={String(base)}
        sources={b.sources}
      >
        <span
          class={
            b.sources.length ? 'border-b border-current/30 border-dotted' : ''
          }
        >
          {display ?? total.toLocaleString()}
        </span>
      </BreakdownTooltip>
    );
  };

  const baseRows: [string, StatRowKey, number, StatId][] = [
    [locale.stats.labelStr, 'str', base.str, StatId.Str],
    [locale.stats.labelInt, 'int', base.intl, StatId.Int],
    [locale.stats.labelWis, 'wis', base.wis, StatId.Wis],
    [locale.stats.labelAgi, 'agi', base.agi, StatId.Agi],
    [locale.stats.labelCon, 'con', base.con, StatId.Con],
    [locale.stats.labelCha, 'cha', base.cha, StatId.Cha],
  ];

  // gearTotalMax is only set when a weapon contributes damage; with no
  // weapon the full range is class/level base, so the fallback is 0.
  const damageBase =
    isOwnCharacter && breakdown
      ? `${(secondary.minDamage - breakdown.damage.gearTotal).toLocaleString()} - ${(secondary.maxDamage - (breakdown.damage.gearTotalMax ?? 0)).toLocaleString()}`
      : undefined;

  return (
    <div class='flex flex-col gap-2 text-sm'>
      {isOwnCharacter && (
        <div
          class={`sticky top-0 z-10 ${UI_PANEL_BORDER} border-b ${UI_STICKY_BG} px-3 py-1.5 ${blur}`}
        >
          <p class='text-center font-medium text-primary text-sm'>
            {statPointsLabel}
          </p>
        </div>
      )}
      <div class='flex gap-4'>
        <div class='flex flex-1 flex-col gap-0.5'>
          {baseRows.map(([label, rowKey, value, statId]) => (
            <div key={label} class='flex items-center justify-between gap-1'>
              <span class='text-primary/60'>{label}</span>
              <span class='flex-1 text-right'>{statRow(rowKey, value)}</span>
              {isOwnCharacter && (
                <Button
                  variant={['xs', canTrain ? 'primary' : 'disabled']}
                  disabled={!canTrain}
                  onClick={() => handleTrain(statId)}
                >
                  <FaArrowUp size={8} />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div class='flex flex-1 flex-col gap-0.5'>
          {/* Damage row — base is a range, render directly */}
          <div class='flex justify-between'>
            <span class='text-primary/60'>{locale.stats.labelDmg}</span>
            {isOwnCharacter && breakdown ? (
              <BreakdownTooltip
                baseLabel={locale.stats.labelBaseClassLevel}
                baseValue={damageBase}
                sources={breakdown.damage.sources}
              >
                <span
                  class={
                    breakdown.damage.sources.length
                      ? 'border-b border-current/30 border-dotted'
                      : ''
                  }
                >
                  {`${secondary.minDamage.toLocaleString()} - ${secondary.maxDamage.toLocaleString()}`}
                </span>
              </BreakdownTooltip>
            ) : (
              <span>{`${secondary.minDamage.toLocaleString()} - ${secondary.maxDamage.toLocaleString()}`}</span>
            )}
          </div>
          <div class='flex justify-between'>
            <span class='text-primary/60'>{locale.stats.labelAccuracy}</span>
            {statRow('accuracy', secondary.accuracy)}
          </div>
          <div class='flex justify-between'>
            <span class='text-primary/60'>{locale.stats.labelEvade}</span>
            {statRow('evade', secondary.evade)}
          </div>
          <div class='flex justify-between'>
            <span class='text-primary/60'>{locale.stats.labelArmor}</span>
            {statRow('armor', secondary.armor)}
          </div>
          <div class='flex justify-between'>
            <span class='text-primary/60'>{locale.stats.labelHp}</span>
            {statRow('maxHp', maxHp)}
          </div>
          <div class='flex justify-between'>
            <span class='text-primary/60'>{locale.stats.labelTp}</span>
            {statRow('maxTp', maxTp)}
          </div>
          {isOwnCharacter &&
            (() => {
              const rates = client.getPlayerRates(client.playerId);
              const speedLabel = (ms: number, baseline: number) =>
                ms <= baseline * 0.9
                  ? locale.stats.speedFast
                  : ms >= baseline * 1.1
                    ? locale.stats.speedSlow
                    : locale.stats.speedMedium;
              const SpeedValue = ({
                label,
                capped,
                tooltipDetail,
              }: {
                label: string;
                capped: boolean;
                tooltipDetail: string;
              }) => (
                <span class='group relative'>
                  {label}
                  {capped && (
                    <span class='ml-1 text-warning text-xs'>
                      ({locale.stats.speedCapped})
                    </span>
                  )}
                  <div class='pointer-events-none absolute bottom-full right-0 z-50 mb-1 w-max max-w-52 rounded bg-base-300 px-2 py-1 text-left text-xs shadow-lg hidden group-hover:block'>
                    <div>{tooltipDetail}</div>
                    {capped && (
                      <div class='mt-0.5 text-warning'>
                        {locale.stats.speedCappedHint}
                      </div>
                    )}
                  </div>
                </span>
              );
              return (
                <>
                  <div class='flex justify-between'>
                    <span class='text-primary/60'>
                      {locale.stats.labelAttackSpeed}
                    </span>
                    <SpeedValue
                      label={speedLabel(rates.attackMs, 600)}
                      capped={rates.attackCapped}
                      tooltipDetail={`${(1000 / rates.attackMs).toFixed(2)} attacks/sec (${rates.attackMs}ms)`}
                    />
                  </div>
                  <div class='flex justify-between'>
                    <span class='text-primary/60'>
                      {locale.stats.labelMoveSpeed}
                    </span>
                    <SpeedValue
                      label={speedLabel(rates.moveMs, 480)}
                      capped={rates.moveCapped}
                      tooltipDetail={`${(1000 / rates.moveMs).toFixed(2)} tiles/sec (${rates.moveMs}ms)`}
                    />
                  </div>
                </>
              );
            })()}
        </div>
      </div>
      {isOwnCharacter && <EffectsSection />}
    </div>
  );
}

function BookTab() {
  const client = useClient();

  const [questNames, setQuestNames] = useState<string[]>(
    () => client.questController.bookQuestNames,
  );

  useEffect(() => {
    const handleBookOpened = (names: string[]) => {
      setQuestNames([...names]);
    };
    client.questController.subscribeBookOpened(handleBookOpened);
    return () => {
      client.questController.unsubscribeBookOpened(handleBookOpened);
    };
  }, [client]);

  return <QuestBookList questNames={questNames} />;
}

export function CharacterDialog() {
  const { locale } = useLocale();
  const client = useClient();
  const info = useCharacterInfo();

  // Read the pending tab set by socialController before dialog mounted.
  const [activeTab, setActiveTab] = useState<CharacterTab>(
    () => client.socialController.pendingCharacterTab ?? 'paperdoll',
  );

  // Track the last playerId for which each tab's data was fetched so we can
  // detect staleness when switching tabs.
  const lastFetchedBookRef = useRef<number | null>(
    // If we opened via BookReply, the data is already fresh.
    client.socialController.pendingCharacterTab === 'book'
      ? (info?.details.playerId ?? null)
      : null,
  );
  const lastFetchedPaperdollRef = useRef<number | null>(
    // If we opened via PaperdollReply (pendingTab is null), data is fresh.
    client.socialController.pendingCharacterTab === null
      ? (info?.details.playerId ?? null)
      : null,
  );

  // Clear the pending tab after we've consumed it.
  useEffect(() => {
    client.socialController.pendingCharacterTab = null;
  }, [client]);

  // When the dialog is already open and a BookReply arrives, switch to book tab.
  useEffect(() => {
    const onBookOpened = ({ details }: { details: CharacterDetails }) => {
      lastFetchedBookRef.current = details.playerId;
      setActiveTab('book');
    };
    client.socialController.subscribeBookOpened(onBookOpened);
    return () => client.socialController.unsubscribeBookOpened(onBookOpened);
  }, [client]);

  // When the dialog is already open and a PaperdollReply arrives, switch to paperdoll tab.
  useEffect(() => {
    const onPaperdollOpened = ({
      details,
    }: {
      details: { playerId: number };
    }) => {
      lastFetchedPaperdollRef.current = details.playerId;
      setActiveTab('paperdoll');
    };
    client.socialController.subscribePaperdollOpened(onPaperdollOpened);
    return () =>
      client.socialController.unsubscribePaperdollOpened(onPaperdollOpened);
  }, [client]);

  const handleTabSelect = (tabId: CharacterTab) => {
    const playerId = info?.details.playerId;
    if (playerId !== undefined) {
      if (
        tabId === 'paperdoll' &&
        (info?.equipment === undefined ||
          lastFetchedPaperdollRef.current !== playerId)
      ) {
        client.socialController.requestPaperdoll(playerId);
        lastFetchedPaperdollRef.current = playerId;
      } else if (tabId === 'book' && lastFetchedBookRef.current !== playerId) {
        client.socialController.requestBook(playerId);
        lastFetchedBookRef.current = playerId;
      }
    }
    setActiveTab(tabId);
  };

  const TABS = useMemo(() => {
    if (info?.details.playerId === client.playerId) {
      return [
        { id: 'paperdoll', label: locale.character.tabPaperdoll },
        { id: 'stats', label: locale.character.tabStats },
        { id: 'book', label: locale.character.tabBook },
      ] as const;
    }

    return [
      { id: 'paperdoll', label: locale.character.tabPaperdoll },
      { id: 'book', label: locale.character.tabBook },
    ] as const;
  }, [info, client, locale]);

  return (
    <DialogBase id='character' title={locale.character.title} size='md'>
      <div class='flex flex-col gap-3'>
        <Tabs
          items={TABS as unknown as { id: string; label: string }[]}
          activeId={activeTab}
          onSelect={(id) => handleTabSelect(id as CharacterTab)}
          style='border'
          size='sm'
        />
        {activeTab === 'paperdoll' && <PaperdollTab />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'book' && <BookTab />}
      </div>
    </DialogBase>
  );
}
