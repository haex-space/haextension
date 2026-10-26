import { formulaImageUrlAsync } from "~/lib/math";
import type { ImageLookup, RenderSource } from "~/lib/render/elements";

type Entry = { state: "loading" } | { state: "ready"; image: HTMLImageElement } | { state: "missing" };

/** Schlüssel einer Bildquelle: gleiche Assets, Data-URLs und Formeln laden nur einmal. */
export function imageSourceKey(source: RenderSource): string {
  if (source.kind === "asset") return `asset:${source.assetId}`;
  if (source.kind === "formula") return `formula:${source.color}:${source.source}`;
  return source.dataUrl;
}

/** Ein Asset als Object-URL, oder null, wenn es auf diesem Gerät fehlt. Der Aufrufer gibt die URL frei. */
export async function assetUrlAsync(assetStore: ReturnType<typeof useAssetStore>, assetId: string): Promise<string | null> {
  const [bytes, meta] = await Promise.all([assetStore.readAsync(assetId), assetStore.metaAsync(assetId)]);
  return bytes && meta ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: meta.mimeType })) : null;
}

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

  /** Setzt eine Formel (lädt MathJax beim ersten Mal); lässt sie sich nicht setzen, bleibt sie ein Platzhalter. */
  async function loadFormulaAsync(key: string, source: string, color: string) {
    const url = await formulaImageUrlAsync(source, color);
    if (disposed) return;
    if (!url) {
      entries.set(key, { state: "missing" });
      return;
    }
    show(key, url);
  }

  async function loadAssetAsync(key: string, assetId: string) {
    const url = await assetUrlAsync(assetStore, assetId);
    if (!url) {
      if (!disposed) entries.set(key, { state: "missing" });
      return;
    }
    objectUrls.push(url);
    if (disposed) {
      URL.revokeObjectURL(url);
      return;
    }
    show(key, url);
  }

  const lookup: ImageLookup = (source) => {
    const key = imageSourceKey(source);
    const entry = entries.get(key);
    if (entry) return entry.state === "ready" ? entry.image : null;
    entries.set(key, { state: "loading" });
    if (source.kind === "inline") show(key, source.dataUrl);
    else if (source.kind === "formula") loadFormulaAsync(key, source.source, source.color).catch(() => entries.set(key, { state: "missing" }));
    else loadAssetAsync(key, source.assetId).catch(() => entries.set(key, { state: "missing" }));
    return null;
  };

  onUnmounted(() => {
    disposed = true;
    for (const url of objectUrls) URL.revokeObjectURL(url);
  });

  return { lookup };
}
