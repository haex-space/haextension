import type { ModelJobCompletion } from "@haex-space/vault-sdk";
import type {
  ImageElement,
  LatexElement,
  RecognitionError,
  RecognitionPlace,
  TableElement,
  TextElement,
} from "~/types/document";
import { computeBbox } from "../bbox";
import { FORMULA_INK, latexElementOf } from "../latexElement";
import { renderLatexAsync } from "../math";
import { boxToRect, fontSizeFor, LINE_HEIGHT, tidy, type Fit, type Rect } from "./layout";

/**
 * Vom Ende eines Auftrags „Seitenerkennung“ zu Elementen der Seite (haex-space/haex-vault@
 * 74263d8c6e8e23831e4a5016797c3db4987d8697:specs/046-paper-notes-canvas/contracts/page-job.md
 * §Abbildung und §Fehler). holzi hat das Format schon geprüft; hier wird
 * trotzdem defensiv gelesen, weil ein Format nicht alles festhält (etwa gleich lange Zeilen).
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface ReadRegion {
  kind: "text" | "table" | "image" | "formula";
  box: number[];
  text?: string;
  /** LaTeX einer Formelzeile (Art `formula`). */
  latex?: string;
  rows?: string[][];
}

export type PageJobOutcome =
  | {
      kind: "completed";
      regions: ReadRegion[];
      rotation: Rotation;
      /** Die Texte der Regionen mit Text nach der Korrektur, oder null, wenn der Korrekturschritt nichts Brauchbares lieferte. */
      texts: string[] | null;
      model?: string;
      place?: RecognitionPlace;
    }
  | { kind: "failed"; error: RecognitionError }
  | { kind: "cancelled" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const KINDS = ["text", "table", "image", "formula"] as const;
const ROTATIONS = [0, 90, 180, 270] as const;
const ERRORS: readonly RecognitionError[] = ["no_capable_model", "consent_denied", "unusable", "timeout", "unavailable"];

function readRegions(read: unknown): { regions: ReadRegion[]; rotation: Rotation } {
  const page = isRecord(read) ? read : {};
  const regions = (Array.isArray(page.regions) ? page.regions : []).flatMap((value): ReadRegion[] => {
    if (!isRecord(value) || !KINDS.includes(value.kind as ReadRegion["kind"]) || !Array.isArray(value.box)) return [];
    const region: ReadRegion = { kind: value.kind as ReadRegion["kind"], box: value.box.filter((n) => typeof n === "number") };
    // Eine Formelzeile hat ihre Quelle in `latex`; ein `text` daneben gehört nicht in die Korrektur der Texte.
    if (region.kind === "formula") {
      if (typeof value.latex === "string") region.latex = value.latex;
      return [region];
    }
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

/** Ab dieser Ähnlichkeit gilt ein Text des Korrekturschritts als Korrektur eines gelesenen Textes. */
const MIN_SIMILARITY = 0.5;

interface Grams {
  clean: string;
  counts: Map<string, number>;
  total: number;
}

const gramsOf = (text: string): Grams => {
  const clean = text.toLowerCase().replace(/\s+/g, " ").trim();
  const counts = new Map<string, number>();
  for (let i = 0; i < clean.length - 1; i++) {
    const gram = clean.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return { clean, counts, total: Math.max(0, clean.length - 1) };
};

/** Dice-Ähnlichkeit zweier Texte über ihre Zeichenpaare, 0 bis 1. */
function similarity(a: Grams, b: Grams): number {
  if (a.clean === b.clean) return 1;
  let common = 0;
  for (const [gram, count] of a.counts) common += Math.min(count, b.counts.get(gram) ?? 0);
  const total = a.total + b.total;
  return total === 0 ? 0 : (2 * common) / total;
}

/**
 * Die Texte der Regionen mit Text nach dem Korrekturschritt (research R12 in haex-space/haex-vault@e4b28be9d22e8c0839f8652908b35b78e04c9c6e:specs/046-paper-notes-canvas/research.md).
 * Ein kleines Modell liefert selten genau einen Text je Region; es schreibt etwa Tabellenzellen als eigene Texte
 * mit. Darum wird jede korrigierte Fassung dem ähnlichsten gelesenen Text zugeordnet, nicht der Reihe nach.
 * Was keinem ähnlich genug ist, ein Umschreiben oder eine Zelle, ändert nichts; ein Text ohne Korrektur bleibt,
 * wie er gelesen wurde. Null, wenn die Antwort kein Format `text-fix` hat.
 */
function fixedTexts(fix: unknown, regions: ReadRegion[]): string[] | null {
  const fixed = isRecord(fix) && Array.isArray(fix.texts) ? fix.texts : null;
  if (!fixed || !fixed.every((t) => typeof t === "string")) return null;
  const read = regions.filter(hasText).map((region) => region.text!);
  const readGrams = read.map(gramsOf);
  const fixedGrams = (fixed as string[]).map(gramsOf);
  const pairs: { read: number; fixed: number; score: number }[] = [];
  read.forEach((_, i) => (fixed as string[]).forEach((_candidate, j) => {
    const score = similarity(readGrams[i]!, fixedGrams[j]!);
    if (score >= MIN_SIMILARITY) pairs.push({ read: i, fixed: j, score });
  }));
  pairs.sort((a, b) => b.score - a.score || a.read - b.read);
  const result = [...read];
  const usedRead = new Set<number>();
  const usedFixed = new Set<number>();
  for (const pair of pairs) {
    if (usedRead.has(pair.read) || usedFixed.has(pair.fixed)) continue;
    usedRead.add(pair.read);
    usedFixed.add(pair.fixed);
    result[pair.read] = (fixed as string[])[pair.fixed]!;
  }
  return result;
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
  /** Die LaTeX-Quelle einer Formelzeile. */
  latex?: string;
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
    if (region.kind === "formula") {
      const latex = region.latex?.trim();
      return latex ? [{ region, latex }] : [];
    }
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

/**
 * Das Element einer Formelzeile: die gesetzte Formel in der Schriftgröße eines Textblocks dieser Höhe,
 * höchstens so breit wie die Box. Lässt sich die Quelle nicht setzen, bleibt sie als Text stehen, damit
 * nichts verloren geht (FR-030).
 */
export async function formulaElement(placed: PlacedRegion, id: string, fontFamily: string, color = FORMULA_INK): Promise<LatexElement | TextElement> {
  const { rect } = placed;
  const source = placed.latex ?? "";
  const set = await renderLatexAsync(source);
  if ("error" in set) {
    return textOrTableElement({ ...placed, text: source, latex: undefined }, id, fontFamily) as TextElement;
  }
  const em = fontSizeFor(rect.height, 1);
  const element = latexElementOf(id, source, set, { x: rect.x, y: rect.y }, em, { maxWidth: rect.width, color });
  // Mittig in der Box, wenn die Formel niedriger ist als sie.
  element.y = rect.y + Math.max(0, (rect.height - element.height) / 2);
  element.bbox = computeBbox(element);
  return element;
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
