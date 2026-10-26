import type { PageElement, PaperNoteCloseUp, PaperNoteImport, RecognitionError, RecognitionPlace, RecognizedRegion } from "~/types/document";
import { addElements, composite, removeElements, setPaperImport, type Command, type PageDoc } from "../commands";
import type { Box } from "../elementEdits";
import { drawingLayerId } from "../migratePage";
import { LAYER_NAMES, readTurnedAsync, type ImportDeps, type Photo } from "./importPage";
import { fitInRect } from "./layout";
import { formulaElement, imageElement, placeRegions, textOrTableElement, type PlacedRegion } from "./mapResult";

/**
 * Eine schlecht erkannte Stelle über ein Nahfoto neu lesen (research R13 in haex-space/haex-vault@e4b28be9d22e8c0839f8652908b35b78e04c9c6e:specs/046-paper-notes-canvas/research.md):
 * das Nahfoto läuft durch denselben Auftrag, sein Ergebnis wird in das Rechteck eingepasst und ersetzt
 * die erzeugten Elemente, die ganz darin liegen.
 *
 * Lesen und Übernehmen sind getrennt: während des Lesens kann der Schüler weiterarbeiten. Erst
 * `commitAsync` speichert Nahfoto und Ausschnitte und liest den Stand der Seite; Elemente und
 * Herkunft ändern sich dann in einem Kommando. Ein Fehler oder Abbruch ändert nichts und speichert nichts.
 */

export type CloseUpResult =
  | { kind: "read"; model?: string; place?: RecognitionPlace; commitAsync: () => Promise<Command> }
  | { kind: "failed"; error: RecognitionError }
  | { kind: "cancelled" };

const LABEL = "Stelle neu lesen";

const inside = ([x, y, width, height]: readonly number[], box: Box) =>
  x! >= box.x && y! >= box.y && x! + width! <= box.x + box.width && y! + height! <= box.y + box.height;

/** Erzeugte Elemente auf bearbeitbaren Ebenen, die ganz im Rechteck liegen. */
function replacedIds(page: PageDoc, paperImport: PaperNoteImport, box: Box): Set<string> {
  const generated = new Set(paperImport.regions.flatMap((region) => region.elementIds));
  return new Set(page.layers
    .filter((layer) => !layer.locked)
    .flatMap((layer) => layer.elements)
    .filter((element) => generated.has(element.id) && inside(element.bbox, box))
    .map((element) => element.id));
}

/** Die Ebene mit diesem Namen, sonst die oberste bearbeitbare. */
function layerNamed(page: PageDoc, name: string): string {
  return page.layers.find((layer) => layer.name === name && !layer.locked)?.id ?? drawingLayerId(page.layers)!;
}

export async function readCloseUpAsync(
  photo: Photo,
  box: Box,
  page: PageDoc,
  fontFamily: string,
  deps: ImportDeps,
): Promise<CloseUpResult> {
  if (!page.paperImport) throw new Error("[haex-notes] A close-up needs a page read from a photo");

  let read: Awaited<ReturnType<typeof readTurnedAsync>>;
  try {
    read = await readTurnedAsync(photo.rotation, deps);
  } catch {
    return { kind: "failed", error: "processing_failed" };
  }
  const { copy, outcome, rotation } = read;
  if (outcome.kind !== "completed") return outcome.kind === "failed" ? outcome : { kind: "cancelled" };
  const { model, place } = outcome;

  const placed = placeRegions(outcome, fitInRect(copy.width, copy.height, box), page.width);
  // Ohne eine brauchbare Region würde das Nahfoto die Stelle nur leeren.
  if (placed.length === 0) return { kind: "failed", error: "unusable" };
  let crops: (Uint8Array | null)[];
  try {
    crops = await Promise.all(placed.map((p) => (p.region.kind === "image" ? copy.crop(p.region.box) : null)));
  } catch {
    return { kind: "failed", error: "processing_failed" };
  }

  async function commitAsync(): Promise<Command> {
    const closeUpId = deps.newId();
    const texts: PageElement[] = [];
    const objects: PageElement[] = [];
    const regions: RecognizedRegion[] = [];
    for (const [i, region] of placed.entries()) {
      const element = await elementOf(region, crops[i]!, fontFamily, deps);
      if (!element) continue;
      (element.type === "text" || element.type === "latex" ? texts : objects).push(element);
      regions.push({
        id: deps.newId(), kind: region.region.kind, sourceBox: region.region.box as RecognizedRegion["sourceBox"],
        elementIds: [element.id], closeUpId,
      });
    }
    const assetId = await deps.putAsset(photo.bytes, photo.mimeType, photo.fileName);

    // Der Stand der Seite erst jetzt: während des Lesens kann sich viel geändert haben.
    const paperImport = page.paperImport;
    if (!paperImport) throw new Error("[haex-notes] The page lost its photo origin while reading");
    const replaced = replacedIds(page, paperImport, box);
    const now = deps.now();
    const closeUp: PaperNoteCloseUp = {
      id: closeUpId, assetId, rotation, pageBox: [box.x, box.y, box.width, box.height],
      model, place, createdAt: now,
    };
    const next: PaperNoteImport = {
      ...paperImport,
      regions: [...paperImport.regions.filter((region) => !region.elementIds.some((id) => replaced.has(id))), ...regions],
      closeUps: [...(paperImport.closeUps ?? []), closeUp],
      updatedAt: now,
    };
    return composite(
      LABEL, page.id,
      removeElements(page, [...replaced], LABEL),
      addElements(page, layerNamed(page, LAYER_NAMES.text), texts, LABEL),
      addElements(page, layerNamed(page, LAYER_NAMES.objects), objects, LABEL),
      setPaperImport(page, next, LABEL),
    );
  }

  return { kind: "read", model, place, commitAsync };
}

async function elementOf(placed: PlacedRegion, crop: Uint8Array | null, fontFamily: string, deps: ImportDeps) {
  const id = deps.newId();
  if (placed.region.kind === "formula") return formulaElement(placed, id, fontFamily);
  if (!crop) return textOrTableElement(placed, id, fontFamily);
  return imageElement(placed, id, await deps.putAsset(crop, "image/jpeg", `crop-${id}.jpg`));
}
