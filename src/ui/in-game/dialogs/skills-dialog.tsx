import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import type { SkillCatalogEntry } from '@/controllers';
import type { LocaleStrings } from '@/locale';
import { playSfxById, SfxId } from '@/sfx';
import { UI_ITEM_BG, UI_PANEL_BORDER, UI_STICKY_BG } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { SlotType } from '@/ui/enums';
import {
  SkillIcon,
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
      <SkillIcon
        iconId={entry.iconId}
        label={entry.name}
        tone='neutral'
        sizeClass='h-12 w-12'
      />
      <p class='wrap-break-word line-clamp-2 w-full text-center font-semibold text-xs leading-tight'>
        {entry.name}
      </p>
    </div>
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

function reasonFor(
  state: SkillState,
  entry: SkillCatalogEntry,
  locale: LocaleStrings,
): string | null {
  switch (state) {
    case 'level-locked':
      return locale.skills.requiresLevel.replace(
        '{level}',
        String(entry.minLevel),
      );
    case 'unaffordable':
      return locale.skills.requiresPoints.replace(
        '{cost}',
        String(entry.skillPointCost),
      );
    case 'learned':
      return locale.skills.learnedBadge;
    default:
      return null;
  }
}

function TreeSkillCard({
  entry,
  state,
  reason,
  onLearn,
}: {
  entry: SkillCatalogEntry;
  state: SkillState;
  reason: string | null;
  onLearn: () => void;
}) {
  const clickable = state === 'learnable';
  return (
    <button
      type='button'
      disabled={!clickable}
      onClick={clickable ? onLearn : undefined}
      class={`flex flex-col items-center gap-1 rounded border p-2 text-left transition-colors ${UI_ITEM_BG} ${
        state === 'learned'
          ? 'border-success/40'
          : clickable
            ? `${UI_PANEL_BORDER} cursor-pointer hover:border-success/60 hover:bg-success/10`
            : `${UI_PANEL_BORDER} cursor-not-allowed opacity-60`
      }`}
    >
      <SkillIcon
        iconId={entry.iconId}
        label={entry.name}
        tone='neutral'
        sizeClass='h-10 w-10'
        active={state === 'learned'}
      />
      <p class='wrap-break-word line-clamp-2 w-full text-center font-semibold text-xs leading-tight'>
        {entry.name}
      </p>
      {reason && (
        <p
          class={`text-center text-[10px] leading-tight ${
            state === 'learned' ? 'text-success' : 'text-base-content/50'
          }`}
        >
          {reason}
        </p>
      )}
    </button>
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
  const [points, setPoints] = useState(
    () => client.skillController.skillPoints,
  );

  useEffect(
    () =>
      client.skillController.subscribe(() => {
        setEntries([...client.skillController.catalog.values()]);
        setKnown(new Set(client.skillController.knownSkills));
        setPoints(client.skillController.skillPoints);
      }),
    [client],
  );

  const tiers = useMemo(
    () => tiersFor(entries, client.classId),
    [entries, client.classId],
  );

  const learnedEntries = useMemo(
    () => entries.filter((e) => known.has(e.skillId)),
    [entries, known],
  );

  const handleLearn = useCallback(
    (entry: SkillCatalogEntry) => {
      client.skillController.requestLearn(entry.skillId);
    },
    [client],
  );

  return (
    <DialogBase id='skills' title={locale.skills.title} size='xl' avoidBottom>
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
                <div class='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                  {tierEntries.map((entry) => {
                    const state = skillState(
                      entry,
                      known.has(entry.skillId),
                      level,
                      points,
                    );
                    return (
                      <TreeSkillCard
                        key={entry.skillId}
                        entry={entry}
                        state={state}
                        reason={reasonFor(state, entry, locale)}
                        onLearn={() => handleLearn(entry)}
                      />
                    );
                  })}
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
