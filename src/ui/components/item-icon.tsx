import { useEffect, useState } from 'preact/hooks';
import { GfxType } from '@/gfx';
import { useClient } from '@/ui/context';

// Module-level object URL cache keyed by graphicId (survives re-renders)
const urlCache = new Map<number, string>();

async function loadItemUrl(
  gfxLoader: {
    loadResource(fileID: number, resourceID: number): Promise<ImageBitmap>;
  },
  graphicId: number,
): Promise<string> {
  const cached = urlCache.get(graphicId);
  if (cached) return cached;

  const bitmap = await gfxLoader.loadResource(
    GfxType.Items,
    100 + graphicId * 2,
  );

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const url = URL.createObjectURL(blob);

  urlCache.set(graphicId, url);
  return url;
}

type Props = {
  graphicId: number;
  alt?: string;
  class?: string;
};

export function ItemIcon({ graphicId, alt = '', class: className }: Props) {
  const client = useClient();
  // src derives from the cache keyed by the CURRENT prop — never stored
  // in state. Storing it froze the first loaded image: the effect
  // early-returned on `src` being set, so a graphicId change on a
  // mounted icon (equip-swap replacing a slot's item) kept the old
  // image. The state below only exists to re-render when an async load
  // completes.
  const [, setLoaded] = useState(0);
  const src = urlCache.get(graphicId) ?? null;

  useEffect(() => {
    if (urlCache.has(graphicId)) return;
    let cancelled = false;
    loadItemUrl(client.gfxLoader, graphicId).then(() => {
      if (!cancelled) setLoaded((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [client, graphicId]);

  if (!src) {
    return <div class={`skeleton ${className ?? ''}`} />;
  }

  return <img src={src} alt={alt} class={className} />;
}
