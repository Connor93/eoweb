import { createPortal } from 'preact/compat';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import type { SkillCatalogEntry } from '@/controllers';
import { playSfxById, SfxId } from '@/sfx';
import { Button, Confirm, PortalTooltip } from '@/ui/components';
import { UI_ITEM_BG, UI_PANEL_BORDER, UI_STICKY_BG } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { SlotType } from '@/ui/enums';
import {
  SkillIcon,
  skillStatLine,
  useBackdropBlur,
  useItemDrag,
  usePlayerStats,
} from '@/ui/in-game';
import { DialogBase } from './dialog-base';

/**
 * Drag-ghost icon: still an initial-letter data URI. A self-contained
 * data-URI can't easily mask-tint an external SVG, so the ghost stays a
 * letter for now (deferred); the card badge itself uses <SkillIcon>.
 */
function placeholderIconUri(name: string): string {
  const letter = (name[0] ?? '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="32"><rect width="34" height="32" rx="4" fill="#3b3b52"/><text x="17" y="22" font-size="18" fill="#e8e8f0" text-anchor="middle" font-family="sans-serif">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// SkillCard — drag-to-hotbar. Kept byte-for-byte from the flat dialog: the
// hotbar depends on this exact contract (source: 'skill' + SlotType.NewSkill).
// ---------------------------------------------------------------------------

function SkillCard({ entry }: { entry: SkillCatalogEntry }) {
  const client = useClient();
  const { startDrag } = useItemDrag();
  const cardRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      const el = cardRef.current;
      if (!el) return;
      playSfxById(SfxId.InventoryPickup);
      startDrag({
        element: el,
        info: {
          source: 'skill',
          itemId: 0,
          pointerId: e.pointerId,
          ghostX: e.clientX,
          ghostY: e.clientY,
          offsetX: 17,
          offsetY: 16,
          graphicId: 0,
          ghostWidth: 34,
          ghostHeight: 32,
          ghostImageUrl: placeholderIconUri(entry.name),
        },
        onResolve: (result) => {
          if (result.type === 'hotbar-slot') {
            client.hotbarController.setSlot(result.index, {
              type: SlotType.NewSkill,
              typeId: 0,
              skillId: entry.skillId,
            });
            playSfxById(SfxId.InventoryPlace);
          }
        },
      });
    },
    [entry, startDrag, client],
  );

  return (
    <div
      ref={cardRef}
      class={`flex cursor-grab flex-col items-center gap-1 rounded border ${UI_PANEL_BORDER} ${UI_ITEM_BG} p-2 active:cursor-grabbing`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
    >
      {/* Whole card is the hover region — no action button to avoid here. */}
      <SkillTooltipRegion
        entry={entry}
        class='flex w-full flex-col items-center gap-1'
      >
        <SkillIcon
          iconId={entry.iconId}
          label={entry.name}
          tone='neutral'
          sizeClass='h-12 w-12'
        />
        <p class='wrap-break-word line-clamp-2 w-full text-center font-semibold text-xs leading-tight'>
          {entry.name}
        </p>
      </SkillTooltipRegion>
    </div>
  );
}

/**
 * Wraps a skill's icon in its hover tooltip: name, then the stat line
 * (cost / cooldown / range), then the authored description.
 *
 * The tooltip attaches when either half has something to say. Keying it off
 * the description alone — as this did originally — left most skills with no
 * hover at all, because only 4 of the 14 authored skills carry a description
 * while every one of them has a TP cost and a cooldown worth reading. The
 * stat line comes from the same `skillStatLine` the hotbar slot uses, so the
 * two surfaces cannot drift on formatting or on which parts they drop.
 */
function SkillTooltipRegion({
  entry,
  class: layoutClass,
  children,
}: {
  entry: SkillCatalogEntry;
  /**
   * Layout classes for the hoverable region. Applied identically whether or
   * not a tooltip is attached, so the two branches lay out the same — and it
   * must establish a flex container, because SkillIcon is an empty span sized
   * only by height/width utilities, which a plain inline wrapper would ignore,
   * collapsing the icon to nothing.
   */
  class: string;
  children: preact.ComponentChildren;
}) {
  const { locale } = useLocale();
  const statLine = skillStatLine(entry, locale);

  if (!statLine && !entry.description) {
    return <div class={layoutClass}>{children}</div>;
  }

  return (
    <PortalTooltip
      wrapperClass={layoutClass}
      tooltip={
        <>
          <p class='font-semibold'>{entry.name}</p>
          {statLine && <p class='opacity-70'>{statLine}</p>}
          {entry.description && <p class='opacity-80'>{entry.description}</p>}
        </>
      }
    >
      {children}
    </PortalTooltip>
  );
}

// ---------------------------------------------------------------------------
// Tree — tiered by minLevel, gated by class, one of four states per entry.
// ---------------------------------------------------------------------------

type SkillState = 'learned' | 'learnable' | 'level-locked' | 'unaffordable';

function skillState(
  entry: SkillCatalogEntry,
  known: boolean,
  level: number,
  points: number,
): SkillState {
  if (known) return 'learned';
  if (level < entry.minLevel) return 'level-locked';
  if (points < entry.skillPointCost) return 'unaffordable';
  return 'learnable';
}

/** Skills this character's class can learn, grouped into ascending level
 *  tiers. classRequirement 0 means every class — the same convention items
 *  use — so those appear in every tree. */
function tiersFor(
  catalog: Iterable<SkillCatalogEntry>,
  characterClass: number,
): [number, SkillCatalogEntry[]][] {
  const byTier = new Map<number, SkillCatalogEntry[]>();
  for (const e of catalog) {
    if (e.classRequirement !== 0 && e.classRequirement !== characterClass) {
      continue;
    }
    const tier = byTier.get(e.minLevel) ?? [];
    tier.push(e);
    byTier.set(e.minLevel, tier);
  }
  return [...byTier.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * One tree entry as a row: icon left, name + cost centre, action right.
 *
 * Deliberately a <div>, not a <button>. The whole card used to be clickable,
 * which learned a skill in one unconfirmed click; the Learn button now owns
 * that action, and a button cannot be nested inside another button.
 */
function TreeSkillRow({
  entry,
  state,
  onLearn,
}: {
  entry: SkillCatalogEntry;
  state: SkillState;
  onLearn: () => void;
}) {
  const { locale } = useLocale();
  const learned = state === 'learned';
  const costText = locale.skills.cost.replace(
    '{cost}',
    String(entry.skillPointCost),
  );

  return (
    <div
      class={`flex items-center gap-2 rounded border p-2 ${UI_ITEM_BG} ${
        learned ? 'border-success/40' : UI_PANEL_BORDER
      } ${state === 'level-locked' ? 'opacity-60' : ''}`}
    >
      {/* Hover region = icon + name + cost, i.e. the whole row up to but not
          including the action, so hovering never fights the Learn button. */}
      <SkillTooltipRegion
        entry={entry}
        class='flex min-w-0 flex-1 items-center gap-2'
      >
        <SkillIcon
          iconId={entry.iconId}
          label={entry.name}
          tone='neutral'
          sizeClass='h-10 w-10 shrink-0'
          active={learned}
        />

        <div class='min-w-0 flex-1'>
          <p class='wrap-break-word font-semibold text-xs leading-tight'>
            {entry.name}
          </p>
          {/* Cost shows in every state — knowing the price of a skill you
              can't afford yet is the whole point of a tree. */}
          <p
            class={`text-[10px] leading-tight ${
              state === 'unaffordable' ? 'text-warning' : 'text-base-content/50'
            }`}
          >
            {costText}
          </p>
        </div>
      </SkillTooltipRegion>

      {learned ? (
        <span class='shrink-0 font-semibold text-success text-xs'>
          {locale.skills.learnedBadge}
        </span>
      ) : (
        <Button
          variant={state === 'learnable' ? ['primary', 'xs'] : ['ghost', 'xs']}
          disabled={state !== 'learnable'}
          onClick={onLearn}
          class='shrink-0'
          label={
            state === 'level-locked'
              ? locale.skills.requiresLevel.replace(
                  '{level}',
                  String(entry.minLevel),
                )
              : undefined
          }
        >
          {state === 'level-locked'
            ? locale.skills.tierLabel.replace('{level}', String(entry.minLevel))
            : locale.skills.learnBtn}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillsDialog
// ---------------------------------------------------------------------------

export function SkillsDialog() {
  const client = useClient();
  const { locale } = useLocale();
  const blur = useBackdropBlur();
  const { level } = usePlayerStats();

  const [entries, setEntries] = useState<SkillCatalogEntry[]>(() => [
    ...client.skillController.catalog.values(),
  ]);
  const [known, setKnown] = useState<Set<string>>(
    () => new Set(client.skillController.knownSkills),
  );
  const [points, setPoints] = useState(() => client.skillPoints);

  useEffect(
    () =>
      client.skillController.subscribe(() => {
        setEntries([...client.skillController.catalog.values()]);
        setKnown(new Set(client.skillController.knownSkills));
        setPoints(client.skillPoints);
      }),
    [client],
  );

  // client.skillPoints is a shared currency also mutated by level-up,
  // recover, item and (legacy ESF) stat-skill flows outside the skill
  // controller — those notify via statsController/statSkillController, not
  // skillController.subscribe(). Mirrors spells-dialog.tsx's subscriptions.
  useEffect(() => {
    const onPointsChanged = () => setPoints(client.skillPoints);
    client.statsController.subscribeStatsUpdated(onPointsChanged);
    client.statSkillController.subscribeSkillsChanged(onPointsChanged);
    return () => {
      client.statsController.unsubscribeStatsUpdated(onPointsChanged);
      client.statSkillController.unsubscribeSkillsChanged(onPointsChanged);
    };
  }, [client]);

  const tiers = useMemo(
    () => tiersFor(entries, client.classId),
    [entries, client.classId],
  );

  const learnedEntries = useMemo(
    () => entries.filter((e) => known.has(e.skillId)),
    [entries, known],
  );

  // Learning is permanent (there is no unlearn or respec), so the Learn button
  // only stages the entry here — the request goes out on confirmation.
  const [pendingLearn, setPendingLearn] = useState<SkillCatalogEntry | null>(
    null,
  );

  const confirmLearn = useCallback(() => {
    if (pendingLearn) {
      client.skillController.requestLearn(pendingLearn.skillId);
    }
    setPendingLearn(null);
  }, [client, pendingLearn]);

  return (
    <DialogBase
      id='skills'
      title={locale.skills.title}
      size='xl'
      avoidBottom
      maxHeight='520px'
    >
      {/* Portalled out: DialogBase's optional backdrop-blur makes it a
          containing block for position:fixed children, and it also clips with
          overflow-hidden — together those would trap the modal inside the
          dialog whenever the blur setting is on. Same escape hatch the chest,
          shop, social and character dialogs already use. */}
      {pendingLearn &&
        createPortal(
          <Confirm
            title={locale.skills.confirmLearnTitle}
            message={locale.skills.confirmLearnMessage
              .replace('{skill}', pendingLearn.name)
              .replace('{cost}', String(pendingLearn.skillPointCost))}
            onYes={confirmLearn}
            onNo={() => setPendingLearn(null)}
          />,
          document.getElementById('ui') ?? document.body,
        )}

      <div
        class={`sticky top-0 z-10 flex items-center justify-between border-b ${UI_PANEL_BORDER} ${UI_STICKY_BG} px-2 py-1.5 ${blur}`}
      >
        <span class='font-semibold text-primary text-xs'>
          {locale.skills.treeTitle}
        </span>
        <span class='text-xs'>
          {locale.skills.points}:{' '}
          <span class='font-semibold tabular-nums'>{points}</span>
        </span>
      </div>

      <div class='grid grid-cols-1 gap-3 p-2 sm:grid-cols-[minmax(0,3fr)_auto_minmax(0,2fr)]'>
        <div class='flex flex-col gap-3'>
          {tiers.length === 0 ? (
            <p class='py-6 text-center text-base-content/50 text-sm'>
              {locale.skills.noSkillsForClass}
            </p>
          ) : (
            tiers.map(([tierLevel, tierEntries]) => (
              <div key={tierLevel}>
                <p class='mb-1 font-semibold text-base-content/60 text-xs uppercase tracking-wide'>
                  {locale.skills.tierLabel.replace(
                    '{level}',
                    String(tierLevel),
                  )}
                </p>
                <div class='flex flex-col gap-1.5'>
                  {tierEntries.map((entry) => (
                    <TreeSkillRow
                      key={entry.skillId}
                      entry={entry}
                      state={skillState(
                        entry,
                        known.has(entry.skillId),
                        level,
                        points,
                      )}
                      onLearn={() => setPendingLearn(entry)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div class={`hidden w-px ${UI_PANEL_BORDER} border-l sm:block`} />

        <div class='flex flex-col gap-2'>
          <p class='mb-1 font-semibold text-base-content/60 text-xs uppercase tracking-wide'>
            {locale.skills.learnedTitle}
          </p>
          {learnedEntries.length === 0 ? (
            <p class='py-6 text-center text-base-content/50 text-sm'>
              {locale.skills.noneLearned}
            </p>
          ) : (
            <div class='grid grid-cols-2 gap-2'>
              {learnedEntries.map((entry) => (
                <SkillCard key={entry.skillId} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </DialogBase>
  );
}
