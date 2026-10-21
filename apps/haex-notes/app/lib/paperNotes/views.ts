import type { PageLayer, PaperNoteImport } from "~/types/document";
import { composite, mutateLayer, type Command, type PageDoc } from "../commands";

/**
 * Ansichten einer Fotoseite (FR-010 in haex-space/haex-vault@d91e91721e4aca4e926fb6c32152c79f317b2d52:specs/046-paper-notes-canvas/spec.md):
 * nur das Original, nur der Entwurf, oder beides übereinander. Eine Ansicht ist nur die
 * Sichtbarkeit der Ebenen; nichts wird gelöscht, und die Seite speichert sie mit.
 */

export type PaperView = "original" | "draft" | "compare";

/** Die Ebene mit dem Original des Fotos. */
export function originalLayerId(layers: readonly PageLayer[], paperImport: PaperNoteImport): string | null {
  const layer = layers.find((l) => l.elements.some((e) =>
    e.type === "image" && e.source.kind === "asset" && e.source.assetId === paperImport.originalAssetId));
  return layer?.id ?? null;
}

function visibilityFor(view: PaperView, isOriginal: boolean): boolean {
  if (view === "compare") return true;
  return (view === "original") === isOriginal;
}

export function viewOf(layers: readonly PageLayer[], originalId: string): PaperView {
  const original = layers.find((l) => l.id === originalId);
  const draftVisible = layers.some((l) => l.id !== originalId && l.visible);
  if (!original?.visible) return "draft";
  return draftVisible ? "compare" : "original";
}

/** Schaltet die Ansicht um; null, wenn sie schon gilt oder die Seite kein Original hat. */
export function setPaperView(page: PageDoc, view: PaperView): Command | null {
  if (!page.paperImport) return null;
  const originalId = originalLayerId(page.layers, page.paperImport);
  if (!originalId) return null;
  const changes = page.layers
    .filter((layer) => layer.visible !== visibilityFor(view, layer.id === originalId))
    .map((layer) => mutateLayer(page, layer.id, { visible: visibilityFor(view, layer.id === originalId) }, "Ansicht"));
  return changes.length ? composite("Ansicht", page.id, ...changes) : null;
}
