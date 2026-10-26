import type { ModelJob } from "@haex-space/vault-sdk";
import type { ImageElement, PageAttachment, PageElement, PageLayer, PaperNoteImport, RecognizedRegion } from "~/types/document";
import { computeBbox } from "../bbox";
import { PHOTO_LAYER_NAME } from "../migratePage";
import { fitImage, type Fit } from "./layout";
import { imageElement, placeRegions, textOrTableElement, type PageJobOutcome, type Rotation } from "./mapResult";
import { buildPageJob } from "./pageJob";
import { toBase64 } from "./workingCopy";

/**
 * Eine Seite aus einem Foto (US1 in haex-space/haex-vault@74263d8c6e8e23831e4a5016797c3db4987d8697:specs/046-paper-notes-canvas/spec.md): Original und Arbeitskopie werden Assets, die
 * Arbeitskopie wird über holzi gelesen, und aus dem Ergebnis entstehen die Ebenen der Seite. Das Original
 * hängt als Anhang an der Seite (FR-022). Jeder Fehler und ein Abbruch ergeben eine Seite, auf der das
 * Foto sichtbar steht (FR-025), damit man von Hand weiterarbeiten kann.
 */

export const LAYER_NAMES = { photo: PHOTO_LAYER_NAME, text: "Text", objects: "Objekte", own: "Eigene Ergänzungen" };

export interface Photo {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  /** Wie der Schüler das Foto vor dem Lesen gedreht hat. */
  rotation: Rotation;
}

/** Die Arbeitskopie, wie der Ablauf sie braucht. */
export interface Copy {
  bytes: Uint8Array;
  width: number;
  height: number;
  crop(box: readonly number[]): Promise<Uint8Array>;
}

export interface ImportDeps {
  putAsset(bytes: Uint8Array, mimeType: string, fileName: string): Promise<string>;
  makeWorkingCopy(rotation: Rotation): Promise<Copy>;
  runJob(job: ModelJob): Promise<PageJobOutcome>;
  newId(): string;
  now(): string;
}

export interface ImportedPage {
  layers: PageLayer[];
  paperImport: PaperNoteImport;
  attachments: PageAttachment[];
}

const turn = (a: Rotation, b: Rotation) => ((a + b) % 360) as Rotation;

/** Das Original aufrecht über der Fläche der Arbeitskopie. */
function originalElement(photo: Photo, assetId: string, rotation: Rotation, fit: Fit, id: string): ImageElement {
  const upright = rotation === 90 || rotation === 270 ? photo.height : photo.width;
  const scale = fit.width / upright;
  const width = photo.width * scale;
  const height = photo.height * scale;
  const element: ImageElement = {
    id, type: "image",
    x: fit.x + fit.width / 2 - width / 2, y: fit.y + fit.height / 2 - height / 2,
    width, height, rotation: (rotation * Math.PI) / 180,
    source: { kind: "asset", assetId }, opacity: 1, bbox: [0, 0, 0, 0],
  };
  element.bbox = computeBbox(element);
  return element;
}

const layer = (id: string, name: string, elements: PageElement[]): PageLayer => ({
  id, name, visible: true, locked: false, elements,
});

/** Der Anhang „Original“: das Foto, wie es aufgenommen wurde. */
const originalOf = (photo: Photo, assetId: string, id: string, addedAt: string): PageAttachment => ({
  id, kind: "original", assetId, name: photo.fileName, mimeType: photo.mimeType, size: photo.bytes.byteLength, addedAt,
});

/**
 * Liest eine Arbeitskopie. Ein Drehhinweis wird einmal befolgt (research R10 in haex-space/haex-vault@74263d8c6e8e23831e4a5016797c3db4987d8697:specs/046-paper-notes-canvas/research.md);
 * ein zweiter nicht, sonst droht eine Schleife. `onCopy` sieht jede Kopie mit ihrer Drehung, bevor sie gelesen wird.
 */
export async function readTurnedAsync(
  rotation: Rotation,
  deps: Pick<ImportDeps, "makeWorkingCopy" | "runJob">,
  onCopy: (copy: Copy, rotation: Rotation) => Promise<void> = async () => {},
): Promise<{ copy: Copy; outcome: PageJobOutcome; rotation: Rotation }> {
  let copy = await deps.makeWorkingCopy(rotation);
  await onCopy(copy, rotation);
  let outcome = await deps.runJob(buildPageJob(toBase64(copy.bytes)));
  if (outcome.kind === "completed" && outcome.rotation !== 0) {
    rotation = turn(rotation, outcome.rotation);
    copy = await deps.makeWorkingCopy(rotation);
    await onCopy(copy, rotation);
    outcome = await deps.runJob(buildPageJob(toBase64(copy.bytes)));
  }
  return { copy, outcome, rotation };
}

/** Liest ein Foto und baut daraus die Ebenen und die Herkunft einer neuen Seite. */
export async function importPhotoAsync(
  photo: Photo,
  page: { width: number; height: number },
  fontFamily: string,
  deps: ImportDeps,
): Promise<ImportedPage> {
  const startedAt = deps.now();
  const originalAssetId = await deps.putAsset(photo.bytes, photo.mimeType, photo.fileName);
  let rotation = photo.rotation;
  let copy: Copy | null = null;
  let workingAssetId: string | undefined;
  let outcome: PageJobOutcome | null = null;
  const originalOnlyPage = (finishedAt: string): ImportedPage => {
    const fallbackFit = fitImage(
      rotation === 90 || rotation === 270 ? photo.height : photo.width,
      rotation === 90 || rotation === 270 ? photo.width : photo.height,
      page.width,
      page.height,
    );
    const original = originalElement(photo, originalAssetId, rotation, fallbackFit, deps.newId());
    return {
      layers: [
        layer(deps.newId(), LAYER_NAMES.photo, [original]),
        layer(deps.newId(), LAYER_NAMES.text, []),
        layer(deps.newId(), LAYER_NAMES.objects, []),
        layer(deps.newId(), LAYER_NAMES.own, []),
      ],
      attachments: [originalOf(photo, originalAssetId, deps.newId(), startedAt)],
      paperImport: {
        version: 1,
        originalAssetId,
        rotation,
        sourceMimeType: photo.mimeType,
        sourceWidth: photo.width,
        sourceHeight: photo.height,
        processing: { state: "failed", error: "processing_failed", startedAt, finishedAt },
        regions: [],
        createdAt: startedAt,
        updatedAt: finishedAt,
      },
    };
  };
  try {
    // Die Drehung schon beim Kopieren übernehmen: scheitert die gedrehte Kopie, steht das Original wie gedreht.
    ({ copy, outcome, rotation } = await readTurnedAsync(rotation, deps, async (next, turned) => {
      rotation = turned;
      workingAssetId = await deps.putAsset(next.bytes, "image/jpeg", `working-${photo.fileName}.jpg`);
    }));
  } catch {
    return originalOnlyPage(deps.now());
  }

  if (!copy || !outcome) throw new Error("[haex-notes] Photo processing ended without a result");
  const fit = fitImage(copy.width, copy.height, page.width, page.height);
  const original = originalElement(photo, originalAssetId, rotation, fit, deps.newId());
  const texts: PageElement[] = [];
  const objects: PageElement[] = [];
  const regions: RecognizedRegion[] = [];
  if (outcome.kind === "completed") {
    try {
      for (const placed of placeRegions(outcome, fit, page.width)) {
        const id = deps.newId();
        const element = textOrTableElement(placed, id, fontFamily)
          ?? imageElement(placed, id, await deps.putAsset(await copy.crop(placed.region.box), "image/jpeg", `crop-${id}.jpg`));
        (element.type === "text" ? texts : objects).push(element);
        regions.push({ id: deps.newId(), kind: placed.region.kind, sourceBox: placed.region.box as RecognizedRegion["sourceBox"], elementIds: [id] });
      }
    } catch {
      return originalOnlyPage(deps.now());
    }
  }

  const finishedAt = deps.now();
  const processing: PaperNoteImport["processing"] =
    outcome.kind === "completed"
      ? { state: "ready", model: outcome.model, place: outcome.place, startedAt, finishedAt }
      : outcome.kind === "failed"
        ? { state: "failed", error: outcome.error, startedAt, finishedAt }
        : { state: "manual", startedAt, finishedAt };
  // Ohne Entwurf stünde die Seite leer da: Dann steht das Foto auf ihr (FR-025).
  const photoLayers = texts.length + objects.length === 0 ? [layer(deps.newId(), LAYER_NAMES.photo, [original])] : [];
  return {
    layers: [
      ...photoLayers,
      layer(deps.newId(), LAYER_NAMES.text, texts),
      layer(deps.newId(), LAYER_NAMES.objects, objects),
      layer(deps.newId(), LAYER_NAMES.own, []),
    ],
    attachments: [originalOf(photo, originalAssetId, deps.newId(), startedAt)],
    paperImport: {
      version: 1,
      originalAssetId,
      workingAssetId,
      rotation,
      sourceMimeType: photo.mimeType,
      sourceWidth: photo.width,
      sourceHeight: photo.height,
      processing,
      regions,
      createdAt: startedAt,
      updatedAt: finishedAt,
    },
  };
}
