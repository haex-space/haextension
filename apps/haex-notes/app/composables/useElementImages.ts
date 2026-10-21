import type { ImageLookup } from "~/lib/render/elements";
import type { ImageSource } from "~/types/document";

type Entry = { state: "loading" } | { state: "ready"; image: HTMLImageElement } | { state: "missing" };

/** Schlüssel einer Bildquelle: gleiche Assets und gleiche Data-URLs laden nur einmal. */
export const imageSourceKey = (source: ImageSource) => (source.kind === "asset" ? `asset:${source.assetId}` : source.dataUrl);

/**
 * Bilder der Seitenelemente für den Renderer. `lookup` gibt zurück, was schon
 * geladen ist, und stößt das Laden des Rests an; `onLoaded` fordert dann einen
 * neuen Frame an. Ein Asset, das auf diesem Gerät fehlt, bleibt ein Platzhalter.
 */
export function useElementImages(onLoaded: () => void) {
  const assetStore = useAssetStore();
  const entries = new Map<string, Entry>();
  const objectUrls: string[] = [];
  let disposed = false;

  function show(key: string, src: string) {
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      entries.set(key, { state: "ready", image });
      onLoaded();
    };
    image.onerror = () => entries.set(key, { state: "missing" });
    image.src = src;
  }

  async function loadAssetAsync(key: string, assetId: string) {
    const [bytes, meta] = await Promise.all([assetStore.readAsync(assetId), assetStore.metaAsync(assetId)]);
    if (disposed) return;
    if (!bytes || !meta) {
      entries.set(key, { state: "missing" });
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: meta.mimeType }));
    objectUrls.push(url);
    show(key, url);
  }

  const lookup: ImageLookup = (source) => {
    const key = imageSourceKey(source);
    const entry = entries.get(key);
    if (entry) return entry.state === "ready" ? entry.image : null;
    entries.set(key, { state: "loading" });
    if (source.kind === "inline") show(key, source.dataUrl);
    else loadAssetAsync(key, source.assetId).catch(() => entries.set(key, { state: "missing" }));
    return null;
  };

  onUnmounted(() => {
    disposed = true;
    for (const url of objectUrls) URL.revokeObjectURL(url);
  });

  return { lookup };
}
