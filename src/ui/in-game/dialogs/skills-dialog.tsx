import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { SkillCatalogEntry } from '@/controllers';
import { playSfxById, SfxId } from '@/sfx';
import { UI_ITEM_BG, UI_PANEL_BORDER } from '@/ui/consts';
import { useClient, useLocale } from '@/ui/context';
import { SlotType } from '@/ui/enums';
import { useItemDrag } from '@/ui/in-game';
import { DialogBase } from './dialog-base';

/** Placeholder drag-ghost icon (real SVG pipeline is Slice 3). */
function placeholderIconUri(name: string): string {
  const letter = (name[0] ?? '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="32"><rect width="34" height="32" rx="4" fill="#3b3b52"/><text x="17" y="22" font-size="18" fill="#e8e8f0" text-anchor="middle" font-family="sans-serif">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

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
      <div class='flex h-12 w-12 items-center justify-center rounded bg-[#3b3b52] font-bold text-[#e8e8f0] text-lg'>
        {(entry.name[0] ?? '?').toUpperCase()}
      </div>
      <p class='wrap-break-word line-clamp-2 w-full text-center font-semibold text-xs leading-tight'>
        {entry.name}
      </p>
    </div>
  );
}

export function SkillsDialog() {
  const client = useClient();
  const { locale } = useLocale();
  const [entries, setEntries] = useState<SkillCatalogEntry[]>(() => [
    ...client.skillController.catalog.values(),
  ]);

  useEffect(
    () =>
      client.skillController.subscribe(() => {
        setEntries([...client.skillController.catalog.values()]);
      }),
    [client],
  );

  return (
    <DialogBase id='skills' title={locale.skills.title} size='md' avoidBottom>
      {entries.length === 0 ? (
        <p class='py-6 text-center text-base-content/50 text-sm'>
          {locale.skills.empty}
        </p>
      ) : (
        <div class='grid max-h-80 grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-3'>
          {entries.map((entry) => (
            <SkillCard key={entry.skillId} entry={entry} />
          ))}
        </div>
      )}
    </DialogBase>
  );
}
