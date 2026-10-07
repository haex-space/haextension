import type { PageBackground, PageLayer } from "~/types/document";

/**
 * Asset-Ids, auf die eine Seite verweist.
 *
 * Wird beim Teilen gebraucht: die Asset-Zeilen gehen in denselben Space wie die
 * Seite, damit der Empfänger Name, Typ und Größe kennt und einen sprechenden
 * Platzhalter sieht, wenn die Datei bei ihm nicht liegt.
 */
export function collectAssetIds(layers: PageLayer[], background: PageBackground): string[] {
  const ids = new Set<string>();

  const overlay = background.overlay;
  if (overlay?.type === "pdf") ids.add(overlay.assetId);
  if (overlay?.type === "image" && overlay.source.kind === "asset") ids.add(overlay.source.assetId);

  for (const layer of layers) {
    for (const element of layer.elements) {
      if (element.type === "image" && element.source.kind === "asset") {
        ids.add(element.source.assetId);
      }
    }
  }

  return [...ids];
}
