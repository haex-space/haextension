import type { PageElement, PaperNoteCloseUp, PaperNoteImport, RecognitionError, RecognitionPlace, RecognizedRegion } from "~/types/document";
import { addElements, composite, removeElements, setPaperImport, type Command, type PageDoc } from "../commands";
import type { Box } from "../elementEdits";
import { drawingLayerId } from "../migratePage";
import { LAYER_NAMES, readTurnedAsync, type ImportDeps, type Photo } from "./importPage";
import { fitInRect } from "./layout";
import { imageElement, placeRegions, textOrTableElement, type PlacedRegion } from "./mapResult";

/**
 * Eine schlecht erkannte Stelle über ein Nahfoto neu lesen (research R13 in haex-space/haex-vault@e4b28be9d22e8c0839f8652908b35b78e04c9c6e:specs/046-paper-notes-canvas/research.md):
 * das Nahfoto läuft durch denselben Auftrag, sein Ergebnis wird in das Rechteck eingepasst und ersetzt
 * die erzeugten Elemente, die ganz darin liegen. Elemente und Herkunft ändern sich in einem Kommando;
 * ein Fehler oder Abbruch ändert nichts und speichert nichts.
 */

export type CloseUpResult =
  | { kind: "replaced"; command: Command; model?: string; place?: RecognitionPlace }
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
  const paperImport = page.paperImport;
  if (!paperImport) throw new Error("[haex-notes] A close-up needs a page read from a photo");

  let read: Awaited<ReturnType<typeof readTurnedAsync>>;
  try {
    read = await readTurnedAsync(photo.rotation, deps);
  } catch {
    return { kind: "failed", error: "processing_failed" };
  }
  const { copy, outcome, rotation } = read;
  if (outcome.kind !== "completed") return outcome.kind === "failed" ? outcome : { kind: "cancelled" };

  // Erst alle Ausschnitte erzeugen, dann speichern: scheitert einer, bleibt nichts zurück.
  const placed = placeRegions(outcome, fitInRect(copy.width, copy.height, box), page.width);
  let crops: (Uint8Array | null)[];
  try {
    crops = await Promise.all(placed.map((p) => (p.region.kind === "image" ? copy.crop(p.region.box) : null)));
  } catch {
    return { kind: "failed", error: "processing_failed" };
  }

  const closeUpId = deps.newId();
  const assetId = await deps.putAsset(photo.bytes, photo.mimeType, photo.fileName);
  const texts: PageElement[] = [];
  const objects: PageElement[] = [];
  const regions: RecognizedRegion[] = [];
  for (const [i, region] of placed.entries()) {
    const element = await elementOf(region, crops[i]!, fontFamily, deps);
    if (!element) continue;
    (element.type === "text" ? texts : objects).push(element);
    regions.push({
      id: deps.newId(), kind: region.region.kind, sourceBox: region.region.box as RecognizedRegion["sourceBox"],
      elementIds: [element.id], closeUpId,
    });
  }

  const replaced = replacedIds(page, paperImport, box);
  const now = deps.now();
  const closeUp: PaperNoteCloseUp = {
    id: closeUpId, assetId, rotation, pageBox: [box.x, box.y, box.width, box.height],
    model: outcome.model, place: outcome.place, createdAt: now,
  };
  const next: PaperNoteImport = {
    ...paperImport,
    regions: [...paperImport.regions.filter((region) => !region.elementIds.some((id) => replaced.has(id))), ...regions],
    closeUps: [...(paperImport.closeUps ?? []), closeUp],
    updatedAt: now,
  };
  const command = composite(
    LABEL, page.id,
    removeElements(page, [...replaced], LABEL),
    addElements(page, layerNamed(page, LAYER_NAMES.text), texts, LABEL),
    addElements(page, layerNamed(page, LAYER_NAMES.objects), objects, LABEL),
    setPaperImport(page, next, LABEL),
  );
  return { kind: "replaced", command, model: outcome.model, place: outcome.place };
}

async function elementOf(placed: PlacedRegion, crop: Uint8Array | null, fontFamily: string, deps: ImportDeps) {
  const id = deps.newId();
  if (!crop) return textOrTableElement(placed, id, fontFamily);
  return imageElement(placed, id, await deps.putAsset(crop, "image/jpeg", `crop-${id}.jpg`));
}
