import type { ModelJobCompletion } from "@haex-space/vault-sdk";
import type {
  ImageElement,
  RecognitionError,
  RecognitionPlace,
  TableElement,
  TextElement,
} from "~/types/document";
import { computeBbox } from "../bbox";
import { boxToRect, fontSizeFor, LINE_HEIGHT, tidy, type Fit, type Rect } from "./layout";

/**
 * Vom Ende eines Auftrags „Seitenerkennung“ zu Elementen der Seite (holzi Spec 046,
 * `contracts/page-job.md` §Abbildung und §Fehler). holzi hat das Format schon geprüft; hier wird
 * trotzdem defensiv gelesen, weil ein Format nicht alles festhält (etwa gleich lange Zeilen).
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface ReadRegion {
  kind: "text" | "table" | "image";
  box: number[];
  text?: string;
  rows?: string[][];
}

export type PageJobOutcome =
  | {
      kind: "completed";
      regions: ReadRegion[];
      rotation: Rotation;
      /** Die korrigierten Texte, oder null, wenn sie nicht zu den gelesenen passen. */
      texts: string[] | null;
      model?: string;
      place?: RecognitionPlace;
    }
  | { kind: "failed"; error: RecognitionError }
  | { kind: "cancelled" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const KINDS = ["text", "table", "image"] as const;
const ROTATIONS = [0, 90, 180, 270] as const;
const ERRORS: readonly RecognitionError[] = ["no_capable_model", "consent_denied", "unusable", "timeout", "unavailable"];

function readRegions(read: unknown): { regions: ReadRegion[]; rotation: Rotation } {
  const page = isRecord(read) ? read : {};
  const regions = (Array.isArray(page.regions) ? page.regions : []).flatMap((value): ReadRegion[] => {
    if (!isRecord(value) || !KINDS.includes(value.kind as ReadRegion["kind"]) || !Array.isArray(value.box)) return [];
    const region: ReadRegion = { kind: value.kind as ReadRegion["kind"], box: value.box.filter((n) => typeof n === "number") };
    if (typeof value.text === "string") region.text = value.text;
    if (Array.isArray(value.rows)) {
      region.rows = value.rows.map((row) => (Array.isArray(row) ? row.map((cell) => (typeof cell === "string" ? cell : "")) : []));
    }
    return [region];
  });
  const rotation = ROTATIONS.find((r) => r === page.rotation) ?? 0;
  return { regions, rotation };
}

const hasText = (region: ReadRegion) => typeof region.text === "string" && region.text.trim() !== "";

/** Die korrigierten Texte, wenn es je gelesenem Text genau einen gibt (research R12). */
function fixedTexts(fix: unknown, regions: ReadRegion[]): string[] | null {
  const texts = isRecord(fix) && Array.isArray(fix.texts) ? fix.texts : null;
  if (!texts || !texts.every((t) => typeof t === "string")) return null;
  return texts.length === regions.filter(hasText).length ? (texts as string[]) : null;
}

/** Das Ende eines Auftrags: die SDK-Antwort oder die Ablehnung des Starts. */
export function outcomeOf(settled: { completion: ModelJobCompletion } | { rejection: unknown }): PageJobOutcome {
  if ("rejection" in settled) {
    const rejection = isRecord(settled.rejection) ? settled.rejection : {};
    const reason = isRecord(rejection.details) ? rejection.details.reason : undefined;
    if (rejection.code === 1002) return { kind: "failed", error: "consent_denied" };
    if (rejection.code === 8001) {
      return { kind: "failed", error: reason === "no_capable_model" ? "no_capable_model" : "unavailable" };
    }
    return { kind: "failed", error: "unavailable" };
  }
  const { completion } = settled;
  if (completion.status === "cancelled") return { kind: "cancelled" };
  if (completion.status === "failed") {
    const code = completion.error?.code as RecognitionError | undefined;
    return { kind: "failed", error: code && ERRORS.includes(code) ? code : "unavailable" };
  }
  const steps = completion.result?.steps ?? [];
  const { regions, rotation } = readRegions(steps.find((s) => s.id === "read")?.result);
  const used = completion.provenance
    .find((p) => p.stepId === "read")
    ?.attempts.find((a) => a.outcome === "used");
  return {
    kind: "completed",
    regions,
    rotation,
    texts: fixedTexts(steps.find((s) => s.id === "fix")?.result, regions),
    model: used?.model,
    place: used?.place,
  };
}

/** Eine Region mit Inhalt, an ihrem Platz auf der Seite. */
export interface PlacedRegion {
  region: ReadRegion;
  rect: Rect;
  /** Der Text, korrigiert, wenn die Korrektur passte. */
  text?: string;
  /** Die Zeilen, auf die längste aufgefüllt. */
  rows?: string[][];
}

/** Regionen mit Inhalt an ihrem Platz; leere Regionen und Boxen ohne Fläche fallen weg. */
export function placeRegions(outcome: Extract<PageJobOutcome, { kind: "completed" }>, fit: Fit, pageWidth: number): PlacedRegion[] {
  let nextText = 0;
  const candidates = outcome.regions.flatMap((region): Omit<PlacedRegion, "rect">[] => {
    const text = hasText(region) ? (outcome.texts?.[nextText] ?? region.text) : undefined;
    if (hasText(region)) nextText++;
    if (region.kind === "text") return text ? [{ region, text }] : [];
    if (region.kind === "table") {
      const width = Math.max(0, ...(region.rows ?? []).map((row) => row.length));
      if (width === 0) return [];
      return [{ region, rows: region.rows!.map((row) => [...row, ...Array<string>(width - row.length).fill("")]) }];
    }
    return [{ region }];
  });
  const withRects = candidates.flatMap((c) => {
    const rect = boxToRect(c.region.box, fit);
    return rect ? [{ ...c, rect }] : [];
  });
  const tidied = tidy(withRects.map((c) => c.rect), pageWidth);
  return withRects.map((c, i) => ({ ...c, rect: tidied[i]! }));
}

/** Text- oder Tabellenelement einer Region; Bildregionen brauchen erst ihren Ausschnitt ({@link imageElement}). */
export function textOrTableElement(placed: PlacedRegion, id: string, fontFamily: string): TextElement | TableElement | null {
  const { rect } = placed;
  if (placed.text !== undefined) {
    const lines = placed.text.split("\n").length;
    const fontSize = fontSizeFor(rect.height, lines);
    const element: TextElement = {
      id, type: "text", x: rect.x, y: rect.y, width: Math.max(rect.width, 40),
      height: lines * fontSize * LINE_HEIGHT, rotation: 0, text: placed.text,
      fontFamily, fontSize, color: "#1f2937", bbox: [0, 0, 0, 0],
    };
    element.bbox = computeBbox(element);
    return element;
  }
  if (placed.rows) {
    const rows = placed.rows.length;
    const columns = placed.rows[0]!.length;
    const element: TableElement = {
      id, type: "table", x: rect.x, y: rect.y, columns, rows,
      columnWidths: Array<number>(columns).fill(rect.width / columns),
      rowHeights: Array<number>(rows).fill(Math.max(24, rect.height / rows)),
      cells: placed.rows, bbox: [0, 0, 0, 0],
    };
    element.bbox = computeBbox(element);
    return element;
  }
  return null;
}

/** Das Bildelement einer Bildregion mit ihrem Ausschnitt als Asset. */
export function imageElement(placed: PlacedRegion, id: string, assetId: string): ImageElement {
  const { rect } = placed;
  const element: ImageElement = {
    id, type: "image", x: rect.x, y: rect.y, width: rect.width, height: rect.height, rotation: 0,
    source: { kind: "asset", assetId }, opacity: 1, bbox: [0, 0, 0, 0],
  };
  element.bbox = computeBbox(element);
  return element;
}
