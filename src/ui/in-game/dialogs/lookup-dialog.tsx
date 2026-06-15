import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  CombatElement,
  combatElementColor,
  combatElementLabel,
} from '@/combat-overlay';
import type {
  ItemLookup,
  LookupDropSource,
  LookupModInfo,
  LookupNpcDrop,
  LookupResult,
  LookupSpawnMap,
  NpcLookup,
} from '@/controllers';
import { ItemIcon } from '@/ui/components';
import { UI_ITEM_BG, UI_PANEL_BORDER } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import {
  formatInstanceBaseStats,
  getItemMeta,
  levelCurve,
  prettyTarget,
} from '@/utils';
import { DialogBase } from './dialog-base';

/** Highest level the picker allows (instance level is a wire char, 1..255). */
const MAX_ITEM_LEVEL = 255;

function fmtNum(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "+10–25%" / "+2" — the rolled range for a possible mod at `level`,
 *  scaled the same way the roll path scales it:
 *  `factor = 1 + (level_curve(level) - 1) * level_scaling`. */
function formatModRange(mod: LookupModInfo, level: number): string {
  const factor = 1 + (levelCurve(level) - 1) * mod.levelScaling;
  const percent = mod.kind === 1 || mod.kind === 2;
  const scale = (n: number) => (percent ? n * factor * 100 : n * factor);
  const lo = scale(mod.low);
  const hi = scale(mod.high);
  const suffix = percent ? '%' : '';
  const range = lo === hi ? fmtNum(lo) : `${fmtNum(lo)}–${fmtNum(hi)}`;
  return `+${range}${suffix}`;
}

function formatPct(pct: number): string {
  return `${pct.toFixed(2).replace(/\.?0+$/, '')}%`;
}

function levelRange(d: LookupDropSource | LookupNpcDrop): string {
  if (!d.instanced || d.levelMax <= 0) return '';
  return d.levelMin === d.levelMax
    ? `Lv ${d.levelMin}`
    : `Lv ${d.levelMin}–${d.levelMax}`;
}

function tierClass(tier: string): string {
  switch (tier) {
    case 'rare':
      return 'text-info';
    case 'epic':
      return 'text-secondary';
    case 'legendary':
      return 'text-warning';
    default:
      return 'text-base-content/60';
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: preact.ComponentChildren;
}) {
  return (
    <div class='flex flex-col gap-1'>
      <div class='border-base-content/10 border-b pb-0.5 font-semibold text-[11px] text-base-content/60 uppercase tracking-wide'>
        {title}
      </div>
      {children}
    </div>
  );
}

function ElementBadge({ element }: { element: number }) {
  if (element === CombatElement.Plain) return null;
  const el = element as CombatElement;
  return (
    <span style={{ color: combatElementColor(el) }} class='text-[11px]'>
      {combatElementLabel(el)}
    </span>
  );
}

function SpawnMaps({ maps, label }: { maps: LookupSpawnMap[]; label: string }) {
  if (maps.length === 0) return null;
  return (
    <Section title={label}>
      <div class='flex flex-wrap gap-1'>
        {maps.map((m) => (
          <span
            key={m.mapId}
            class={`rounded border ${UI_PANEL_BORDER} px-1.5 py-0.5 text-[11px]`}
            title={`Map ${m.mapId}`}
          >
            {m.mapName || `Map ${m.mapId}`}
            {m.count > 1 ? ` ×${m.count}` : ''}
          </span>
        ))}
      </div>
    </Section>
  );
}

function ItemView({ item }: { item: ItemLookup }) {
  const client = useClient();
  const { locale } = useLocale();
  const record = client.getEifRecordById(item.id);
  // Only instanced gear (weapon/armor/accessory) scales with level and
  // rolls mods; stackables show their flat base stats with no picker.
  const instanced = item.category != null;

  const maxLevel = useMemo(() => {
    if (!instanced) return 1;
    const fromDrops = item.drops.reduce((m, d) => Math.max(m, d.levelMax), 0);
    return Math.min(MAX_ITEM_LEVEL, Math.max(100, fromDrops));
  }, [instanced, item.drops]);

  const [level, setLevel] = useState(1);
  const clampLevel = (n: number) =>
    Math.max(1, Math.min(maxLevel, Math.round(n) || 1));

  const baseStats = record
    ? instanced
      ? formatInstanceBaseStats(record, level)
      : getItemMeta(record)
    : [];

  return (
    <div class='flex flex-col gap-2'>
      <div class='flex items-center gap-2'>
        <div
          class={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border ${UI_PANEL_BORDER} bg-base-300 p-1`}
        >
          {item.graphicId > 0 ? (
            <ItemIcon
              graphicId={item.graphicId}
              alt={item.name}
              class='h-9 w-9 object-contain'
            />
          ) : (
            <div class='h-8 w-8 rounded bg-base-content/10' />
          )}
        </div>
        <div class='flex flex-col'>
          <span class='font-semibold'>
            {item.name}{' '}
            <span class='font-normal text-base-content/40 text-xs'>
              #{item.id}
            </span>
          </span>
          <div class='flex items-center gap-2'>
            <span class='text-[11px] text-base-content/60'>
              {item.typeLabel}
            </span>
            <ElementBadge element={item.element} />
          </div>
        </div>
      </div>

      {instanced && (
        <div class='sticky top-0 z-10 -mx-2 flex items-center gap-2 bg-base-200 px-2 py-1'>
          <span class='w-12 shrink-0 tabular-nums text-[11px] text-base-content/60'>
            Lv {level}
          </span>
          <input
            type='range'
            class='range range-xs flex-1'
            min={1}
            max={maxLevel}
            value={level}
            onInput={(e) =>
              setLevel(clampLevel(Number((e.target as HTMLInputElement).value)))
            }
          />
        </div>
      )}

      {baseStats.length > 0 && (
        <Section
          title={
            instanced
              ? `${locale.lookup.baseStats} (Lv ${level})`
              : locale.lookup.baseStats
          }
        >
          <div class='flex flex-col text-xs'>
            {baseStats.map((line, i) => (
              <span key={i} class='text-base-content/80'>
                {line}
              </span>
            ))}
          </div>
        </Section>
      )}

      {item.possibleMods.length > 0 && (
        <Section title={`${locale.lookup.possibleMods} (Lv ${level})`}>
          {item.modsPerTier.length > 0 && (
            <div class='text-[11px] text-base-content/50'>
              {item.modsPerTier.map((t) => `${t.tier} ${t.count}`).join(' · ')}
            </div>
          )}
          <div class='flex flex-col gap-0.5 text-xs'>
            {item.possibleMods.map((m) => (
              <div key={`${m.name}:${m.target}`} class='flex flex-wrap gap-1'>
                <span class='text-base-content/80'>
                  {formatModRange(m, level)} {prettyTarget(m.target)}
                </span>
                <span class='text-base-content/50'>({m.name})</span>
                {m.condition && (
                  <span class='text-base-content/40 italic'>{m.condition}</span>
                )}
                <span class='ml-auto flex gap-1'>
                  {m.tiers.map((t) => (
                    <span key={t} class={`text-[10px] ${tierClass(t)}`}>
                      {t}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {item.drops.length > 0 && (
        <Section title={locale.lookup.dropsFrom}>
          <div class='flex flex-col gap-0.5 text-xs'>
            {item.drops.map((d) => (
              <div key={d.npcId} class='flex items-center gap-2'>
                <span class='text-base-content/80'>{d.npcName}</span>
                {levelRange(d) &&
                  (instanced ? (
                    <button
                      type='button'
                      class='text-info/80 underline-offset-2 hover:underline'
                      title={`Preview at Lv ${d.levelMax}`}
                      onClick={() => setLevel(clampLevel(d.levelMax))}
                    >
                      {levelRange(d)}
                    </button>
                  ) : (
                    <span class='text-base-content/50'>{levelRange(d)}</span>
                  ))}
                <span class='ml-auto tabular-nums text-base-content/60'>
                  {formatPct(d.ratePct)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <SpawnMaps maps={item.spawnMaps} label={locale.lookup.foundOn} />
    </div>
  );
}

function NpcView({ npc }: { npc: NpcLookup }) {
  const { locale } = useLocale();
  return (
    <div class='flex flex-col gap-2'>
      <div class='flex items-center gap-2'>
        <span class='font-semibold'>
          {npc.name}{' '}
          <span class='font-normal text-base-content/40 text-xs'>
            #{npc.id}
          </span>
        </span>
        {npc.boss && (
          <span class='rounded bg-warning/20 px-1 py-0.5 text-[10px] text-warning'>
            BOSS
          </span>
        )}
        <ElementBadge element={npc.element} />
      </div>

      <Section title={locale.lookup.stats}>
        <div class='grid grid-cols-2 gap-x-3 text-xs'>
          {npc.stats.map((s) => (
            <div key={s.label} class='flex justify-between gap-2'>
              <span class='text-base-content/50'>{s.label}</span>
              <span class='tabular-nums text-base-content/80'>{s.value}</span>
            </div>
          ))}
        </div>
      </Section>

      {npc.drops.length > 0 && (
        <Section title={locale.lookup.drops}>
          <div class='flex flex-col gap-0.5 text-xs'>
            {npc.drops.map((d) => (
              <div key={d.itemId} class='flex items-center gap-2'>
                <span class='text-base-content/80'>{d.itemName}</span>
                {levelRange(d) && (
                  <span class='text-base-content/50'>{levelRange(d)}</span>
                )}
                <span class='ml-auto tabular-nums text-base-content/60'>
                  {formatPct(d.ratePct)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <SpawnMaps maps={npc.spawnMaps} label={locale.lookup.foundOn} />
    </div>
  );
}

export function LookupDialog() {
  const client = useClient();
  const { locale } = useLocale();
  const [result, setResult] = useState<LookupResult | null>(() =>
    client.lookupController.current(),
  );

  useEffect(() => {
    const handler = (next: LookupResult | null) => setResult(next);
    client.lookupController.subscribe(handler);
    return () => client.lookupController.unsubscribe(handler);
  }, [client]);

  const title =
    result && result.kind !== 'not_found' ? result.name : locale.lookup.title;

  return (
    <DialogBase id='lookup' title={title} size='sm' avoidBottom>
      <div class={`max-h-[60vh] overflow-y-auto rounded ${UI_ITEM_BG} p-2`}>
        {!result && (
          <p class='py-4 text-center text-sm opacity-50'>
            {locale.lookup.empty}
          </p>
        )}
        {result?.kind === 'item' && <ItemView key={result.id} item={result} />}
        {result?.kind === 'npc' && <NpcView key={result.id} npc={result} />}
        {result?.kind === 'not_found' && (
          <p class='py-4 text-center text-sm opacity-50'>
            {locale.lookup.notFound.replace('{query}', result.query)}
          </p>
        )}
      </div>
    </DialogBase>
  );
}
