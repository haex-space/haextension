# haex-notes Phase 1 (Fundament) — Implementierungsplan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Das Datenmodell von haex-notes von „Strich-Liste plus Tabellen-Liste" auf ein generisches Element-/Layer-Modell mit Command-basiertem Undo und gecachtem Rendering umstellen, ohne dass sich für den Nutzer sichtbar etwas ändert.

**Architecture:** Eine Seite besteht ab jetzt aus `PageLayer[]`, jeder Layer aus `PageElement[]` (heute: `stroke` und `table`, später Text/Bild/Form/LaTeX). Der Dokumentzustand liegt in einfachen JS-Objekten (`PageDoc`), auf denen Kommando-Objekte mit `apply()`/`revert()` arbeiten — dadurch sind Undo-Logik und Migration ohne Vue, Pinia oder DB unit-testbar. Alte Zeilen werden beim Laden von einer reinen Funktion `migratePageRow()` übersetzt, statt per Datenmigration umgeschrieben. Der Canvas wird von einem Dauer-`requestAnimationFrame` auf drei gestapelte Canvas-Ebenen mit Dirty-Flags umgebaut.

**Tech Stack:** Nuxt 4, Vue 3 (Composition API), Pinia, Drizzle ORM (SQLite über `@haex-space/vault-sdk`), perfect-freehand, Vitest 3, TypeScript.

**Design-Grundlage:** [2026-07-28-haex-notes-xournalpp-features.md](./2026-07-28-haex-notes-xournalpp-features.md) — dort stehen Begründung, Gap-Analyse und die Phasen 2 bis 6.

## Status (2026-07-28)

Tasks 1–16 implementiert auf Branch `feat/notes-element-model` (PR folgt). Task 17 automatisiert grün
(`pnpm test` 46/46, `vue-tsc` 0 Fehler, `pnpm build` ✅); `eslint --max-warnings 0` bleibt rot, aber das ist
vorbestehend auf `main` (16 Fehler dort, 10 auf diesem Branch — keiner davon in Phase-1-Code) und nicht Teil
dieses Plans. Die 13-Punkte-Manualprüfung aus Task 17 steht noch aus — braucht ein laufendes haex-vault mit
echtem Test-Notizbuch.

Kleine Abweichungen von der Vorlage, alle im Ausführungslog dokumentiert: ein Typ-Guard in
`commands.test.ts` (Discriminated-Union-Zugriff, der erst bei `vue-tsc` auffiel, nicht bei Vitest),
zwei laut Plantext unbenutzte Importe (`emptyLayer`, `assets`) nicht übernommen, zwei Testzahl-Angaben im
Plan waren um 2 daneben (Dokufehler, kein Codefehler).

**Bekannte Folgeprobleme (nicht Teil dieses Plans, vor Phase 2 einordnen):**
- `PagesSidebar(List).vue` liest weiterhin `page.template` (die alte Spalte) für das Vorlagen-Label. Sobald
  `changePageTemplateAsync` nur noch `background.template` schreibt, läuft dieses Label nach der ersten
  Vorlagenänderung einer Seite auseinander — kosmetisch, aber sichtbar.
- Vor Release vermerken: nach dem ersten Save unter diesem Modell zeigt eine ältere Extension-Version die
  Seite leer (sie liest nur noch `strokes`/`tables`).

---

## Vorbemerkung zum Umfang

Dieser Plan deckt **nur Phase 1** ab. Das ist Absicht:

- Die Phasen 2 bis 6 umfassen zusammen rund 30 weitere Tasks. Ein einziges Dokument dafür wäre unbrauchbar lang und in Teilen veraltet, bevor es zur Hälfte abgearbeitet ist.
- Wichtiger: die Detailentscheidungen der Phasen 2 bis 4 (wie genau die Selektion Elemente trifft, wie der PDF-Cache dimensioniert wird) hängen daran, wie sich das Element-Modell in Phase 1 in der Praxis anfühlt. Sie jetzt in Schritte zu zerlegen hieße raten.
- Das Repo folgt diesem Muster bereits: das Sharing-Design wurde in `share-phase-a-platform`, `share-phase-a2-a3-rust` und `share-phase-b-notes` aufgeteilt.

Nach Abschluss dieses Plans entsteht `2026-XX-XX-haex-notes-phase-2-editieren.md`.

## Abweichung vom Design-Dokument

Das Design beschreibt `PageBackground` als Union aus Vorlage, Bild und PDF. Beim Durchsehen des Bestands zeigt sich: [PageCanvas.vue:103-115](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L103-L115) zeichnet Vorlage **und** Hintergrundbild übereinander — sie schließen sich nicht aus. Eine Union würde dieses Verhalten kaputtmachen. Der Plan implementiert stattdessen eine Komposition:

```ts
interface PageBackground {
  paperColor: string;
  template: PageTemplate;
  overlay?: ImageOverlay | PdfOverlay;
}
```

Eine PDF-Seite ist damit `{ paperColor: "#ffffff", template: "blank", overlay: { type: "pdf", … } }`. Task 16 zieht das Design-Dokument nach.

## Vorbedingungen

- Node und pnpm 10.28.2 installiert, `pnpm install` im Repo-Root gelaufen.
- Arbeitsverzeichnis für alle Kommandos in diesem Plan: `apps/haex-notes` — sofern nicht anders angegeben.
- Ein Branch für diese Arbeit. **Nicht** auf `feat/notes-sharing` arbeiten:

```bash
git checkout main
git checkout -b feat/notes-element-model
```

- Ein Test-Notizbuch mit echten Inhalten (mehrere Striche, mindestens eine Tabelle, ein Hintergrundbild, eine Querformat-Seite) muss vor Beginn im laufenden haex-vault vorhanden sein. Ohne das lässt sich Task 15 nicht abnehmen.

---

## Task 1: Vitest-Infrastruktur

haex-notes hat heute keine Tests. haex-pass und haex-mail nutzen Vitest 3 — dieselbe Einrichtung.

**Files:**
- Create: `apps/haex-notes/vitest.config.ts`
- Create: `apps/haex-notes/app/lib/sanity.test.ts` (wird in Schritt 5 wieder gelöscht)
- Modify: `apps/haex-notes/package.json`

**Step 1: Vitest als devDependency ergänzen**

```bash
pnpm add -D vitest@^3.2.3
```

**Step 2: Konfiguration anlegen**

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineConfig({
  // Die Tests importieren wie die App über den Nuxt-Alias.
  resolve: {
    alias: { "~": app, "@": app },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
```

`environment: "node"` genügt, weil in Phase 1 nur reine Logik getestet wird — kein DOM, kein Canvas.

**Step 3: Test-Skripte eintragen**

Modify `package.json`, im `scripts`-Block nach `"preview"` einfügen:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

**Step 4: Sanity-Test schreiben und laufen lassen**

Create `app/lib/sanity.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `pnpm test`
Expected: `1 passed`

**Step 5: Sanity-Test löschen und committen**

```bash
rm app/lib/sanity.test.ts
git add vitest.config.ts package.json ../../pnpm-lock.yaml
git commit -m "chore(haex-notes): add vitest setup"
```

---

## Task 2: Dokument-Typen anlegen und pageTemplates entkoppeln

Die Element-Typen kommen in eine eigene Datei ohne Abhängigkeit auf Drizzle oder das SDK. Das ist keine Kosmetik: `database/schemas/index.ts` ruft beim Import `getTableName()` aus dem SDK auf, und das soll nicht in jedem Unit-Test mitlaufen.

**Files:**
- Create: `apps/haex-notes/app/types/document.ts`
- Modify: `apps/haex-notes/app/utils/pageTemplates.ts:1`

**Step 1: Typen anlegen**

Create `app/types/document.ts`:

```ts
/**
 * Dokumentmodell einer Notizseite.
 *
 * Bewusst frei von Drizzle-, SDK- und Vue-Importen: Migration, Bounding-Box-
 * Berechnung und die Undo-Kommandos arbeiten auf diesen Typen und sollen ohne
 * DB und ohne Browser testbar bleiben.
 */

export type PageTemplate =
  | "blank"
  | "lined"          // Standard liniert (8mm)
  | "grid"           // Kariert (5mm)
  | "grid-large"     // Großkariert (10mm)
  | "dotgrid"        // Punktraster
  | "lineatur1"      // Schreiblern-Lineatur Klasse 1
  | "lineatur2"      // Schreiblern-Lineatur Klasse 2
  | "lineatur3"      // Schreiblern-Lineatur Klasse 3
  | "music"          // Notenlinien
  | "millimeter";    // Millimeterpapier

export type PageOrientation = "portrait" | "landscape";

/** [x, y, width, height] in Seitenkoordinaten. */
export type BBox = [number, number, number, number];

/**
 * Woher die Bytes eines Bildes kommen.
 *
 * `inline` gibt es für Altbestand (die frühere Spalte `background_image` war eine
 * Data-URL) und für kleine Bilder, die mit einer geteilten Seite mitreisen sollen.
 * Alles Große liegt als Asset auf dem Filesystem.
 */
export type ImageSource =
  | { kind: "asset"; assetId: string }
  | { kind: "inline"; dataUrl: string };

interface ElementBase {
  id: string;
  /** Gecachte achsenparallele Hülle. Nach jeder Geometrieänderung mit computeBbox() neu setzen. */
  bbox: BBox;
}

export interface StrokeElement extends ElementBase {
  type: "stroke";
  /** [x, y, pressure] */
  points: [number, number, number][];
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string;
}

export interface TextElement extends ElementBase {
  type: "text";
  x: number;
  y: number;
  /** Umbruchbreite. */
  width: number;
  /** Beim Committen aus der Textmessung gesetzt. */
  height: number;
  rotation: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
}

export interface ImageElement extends ElementBase {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  source: ImageSource;
  opacity: number;
}

export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "polygon";

export interface ShapeElement extends ElementBase {
  type: "shape";
  kind: ShapeKind;
  points: [number, number][];
  rotation: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

export interface TableElement extends ElementBase {
  type: "table";
  x: number;
  y: number;
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
}

export interface LatexElement extends ElementBase {
  type: "latex";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** LaTeX-Quelle, bleibt editierbar. */
  source: string;
  /** Gerendertes SVG, damit die Anzeige ohne MathJax-Roundtrip auskommt. */
  svg: string;
  color: string;
}

export type PageElement =
  | StrokeElement
  | TextElement
  | ImageElement
  | ShapeElement
  | TableElement
  | LatexElement;

export interface PageLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  elements: PageElement[];
}

export interface ImageOverlay {
  type: "image";
  source: ImageSource;
  opacity: number;
}

export interface PdfOverlay {
  type: "pdf";
  assetId: string;
  pageIndex: number;
}

/**
 * Seitenhintergrund. Papierfarbe, Lineatur und ein optionales Overlay werden
 * übereinander gezeichnet — sie schließen sich nicht aus (so verhält sich der
 * heutige Renderer auch schon).
 */
export interface PageBackground {
  paperColor: string;
  template: PageTemplate;
  overlay?: ImageOverlay | PdfOverlay;
}
```

**Step 2: pageTemplates auf die neue Quelle umhängen**

Modify `app/utils/pageTemplates.ts`, Zeile 1:

```diff
-import type { PageTemplate } from "~/database/schemas";
+import type { PageTemplate } from "~/types/document";
```

Damit hängt `pageTemplates.ts` nicht mehr an Drizzle und kann aus Tests importiert werden.

**Step 3: Typecheck**

Run: `pnpm exec vue-tsc --noEmit -p .`
Expected: keine Fehler in `app/types/document.ts` und `app/utils/pageTemplates.ts`.

Falls `vue-tsc` an anderen, bereits vorhandenen Fehlern scheitert: die Ausgabe nach `types/document` und `utils/pageTemplates` filtern. Vorbestehende Fehler in diesem Plan **nicht** mitreparieren.

**Step 4: Commit**

```bash
git add app/types/document.ts app/utils/pageTemplates.ts
git commit -m "feat(haex-notes): add page document types"
```

---

## Task 3: Bounding-Box-Berechnung

Jedes Element cached seine Hülle. Selektion (Phase 2) und Dirty-Rect-Rendering (Task 11) greifen in jedem Frame darauf zu; sie jedes Mal neu über tausende Stroke-Punkte zu berechnen wäre zu teuer.

**Files:**
- Create: `apps/haex-notes/app/lib/bbox.ts`
- Test: `apps/haex-notes/app/lib/bbox.test.ts`

**Step 1: Failing Test schreiben**

Create `app/lib/bbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ImageElement, StrokeElement, TableElement } from "~/types/document";
import { computeBbox, rotatedRectBbox } from "./bbox";

const stroke = (points: [number, number, number][], size: number): StrokeElement => ({
  id: "s1",
  type: "stroke",
  points,
  color: "#000000",
  size,
  tool: "brush",
  bbox: [0, 0, 0, 0],
});

describe("rotatedRectBbox", () => {
  it("returns the rect itself when there is no rotation", () => {
    expect(rotatedRectBbox(10, 20, 100, 50, 0)).toEqual([10, 20, 100, 50]);
  });

  it("swaps width and height at 90 degrees", () => {
    const [x, y, w, h] = rotatedRectBbox(0, 0, 100, 50, Math.PI / 2);
    expect(w).toBeCloseTo(50);
    expect(h).toBeCloseTo(100);
    // Rotation um den eigenen Mittelpunkt (50, 25).
    expect(x).toBeCloseTo(25);
    expect(y).toBeCloseTo(-25);
  });
});

describe("computeBbox", () => {
  it("pads a stroke by half its width on every side", () => {
    const el = stroke([[10, 10, 0.5], [30, 40, 0.5]], 4);
    expect(computeBbox(el)).toEqual([8, 8, 24, 34]);
  });

  it("returns an empty box for a stroke without points", () => {
    expect(computeBbox(stroke([], 4))).toEqual([0, 0, 0, 0]);
  });

  it("sums column widths and row heights for a table", () => {
    const table: TableElement = {
      id: "t1",
      type: "table",
      x: 80,
      y: 100,
      columns: 3,
      rows: 2,
      columnWidths: [80, 60, 40],
      rowHeights: [30, 20],
      bbox: [0, 0, 0, 0],
    };
    expect(computeBbox(table)).toEqual([80, 100, 180, 50]);
  });

  it("uses the rotated hull for an image", () => {
    const image: ImageElement = {
      id: "i1",
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: Math.PI / 2,
      source: { kind: "inline", dataUrl: "data:," },
      opacity: 1,
      bbox: [0, 0, 0, 0],
    };
    const [, , w, h] = computeBbox(image);
    expect(w).toBeCloseTo(50);
    expect(h).toBeCloseTo(100);
  });
});
```

**Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./bbox"`

**Step 3: Implementierung schreiben**

Create `app/lib/bbox.ts`:

```ts
import type { BBox, PageElement } from "~/types/document";

const EMPTY_BBOX: BBox = [0, 0, 0, 0];

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Achsenparallele Hülle eines Rechtecks, das um seinen eigenen Mittelpunkt gedreht ist. */
export function rotatedRectBbox(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): BBox {
  if (!rotation) return [x, y, width, height];

  const cx = x + width / 2;
  const cy = y + height / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [px, py] of [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ] as [number, number][]) {
    const dx = px - cx;
    const dy = py - cy;
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }

  return [minX, minY, maxX - minX, maxY - minY];
}

function pointsBbox(points: readonly (readonly number[])[], pad: number): BBox {
  if (points.length === 0) return [...EMPTY_BBOX] as BBox;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    const px = point[0]!;
    const py = point[1]!;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }

  return [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2];
}

/** Hülle eines Elements. Nach jeder Geometrieänderung neu setzen. */
export function computeBbox(element: PageElement): BBox {
  switch (element.type) {
    case "stroke":
      return pointsBbox(element.points, element.size / 2);
    case "shape": {
      const raw = pointsBbox(element.points, element.strokeWidth / 2);
      return rotatedRectBbox(raw[0], raw[1], raw[2], raw[3], element.rotation);
    }
    case "table":
      return [element.x, element.y, sum(element.columnWidths), sum(element.rowHeights)];
    case "text":
    case "image":
    case "latex":
      return rotatedRectBbox(element.x, element.y, element.width, element.height, element.rotation);
  }
}
```

**Step 4: Test laufen lassen**

Run: `pnpm test`
Expected: `6 passed`

**Step 5: Commit**

```bash
git add app/lib/bbox.ts app/lib/bbox.test.ts
git commit -m "feat(haex-notes): add element bounding box helpers"
```

---

## Task 4: Migration alter Seitenzeilen

Die zentrale Funktion dieser Phase. Sie ist rein, hat keinen DB-Zugriff und übersetzt eine `pages`-Zeile beliebigen Alters in das neue Modell.

**Files:**
- Create: `apps/haex-notes/app/lib/migratePage.ts`
- Test: `apps/haex-notes/app/lib/migratePage.test.ts`

**Step 1: Failing Test schreiben**

Create `app/lib/migratePage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LEGACY_BACKGROUND_OPACITY, migratePageRow, type LegacyPageRow } from "./migratePage";

const legacyRow: LegacyPageRow = {
  strokes: [
    { id: "s1", points: [[10, 10, 0.5], [30, 40, 0.5]], color: "#000000", size: 4, tool: "brush", brushPreset: "fine-tip" },
    { id: "s2", points: [[50, 50, 0.5]], color: "#dc2626", size: 2, tool: "brush" },
  ],
  tables: [
    { id: "t1", x: 80, y: 100, columns: 2, rows: 2, columnWidths: [80, 80], rowHeights: [30, 30] },
  ],
  template: "grid",
  backgroundImage: null,
  orientation: "portrait",
};

describe("migratePageRow", () => {
  it("puts strokes and tables into one layer, strokes first", () => {
    const { layers } = migratePageRow(legacyRow);
    expect(layers).toHaveLength(1);
    expect(layers[0]!.elements.map((e) => e.id)).toEqual(["s1", "s2", "t1"]);
    expect(layers[0]!.visible).toBe(true);
    expect(layers[0]!.locked).toBe(false);
  });

  it("computes bounding boxes for migrated strokes", () => {
    const { layers } = migratePageRow(legacyRow);
    expect(layers[0]!.elements[0]!.bbox).toEqual([8, 8, 24, 34]);
  });

  it("keeps the template and defaults to white paper", () => {
    const { background } = migratePageRow(legacyRow);
    expect(background.template).toBe("grid");
    expect(background.paperColor).toBe("#ffffff");
    expect(background.overlay).toBeUndefined();
  });

  it("turns a legacy background image into an inline overlay at the old opacity", () => {
    const { background } = migratePageRow({ ...legacyRow, backgroundImage: "data:image/png;base64,AAA" });
    expect(background.overlay).toEqual({
      type: "image",
      source: { kind: "inline", dataUrl: "data:image/png;base64,AAA" },
      opacity: LEGACY_BACKGROUND_OPACITY,
    });
  });

  it("derives page size from the orientation", () => {
    expect(migratePageRow(legacyRow)).toMatchObject({ width: 794, height: 1123 });
    expect(migratePageRow({ ...legacyRow, orientation: "landscape" })).toMatchObject({ width: 1123, height: 794 });
  });

  it("leaves an already migrated row untouched", () => {
    const migrated = migratePageRow(legacyRow);
    const again = migratePageRow({ ...legacyRow, ...migrated });
    expect(again).toEqual(migrated);
  });

  it("replaces an empty layer array with one usable default layer", () => {
    const { layers } = migratePageRow({ ...legacyRow, layers: [] });
    expect(layers).toHaveLength(1);
    expect(layers[0]!.elements).toEqual([]);
  });

  it("handles a completely empty row", () => {
    const { layers, background, width, height } = migratePageRow({});
    expect(layers[0]!.elements).toEqual([]);
    expect(background.template).toBe("lined");
    expect(width).toBe(794);
    expect(height).toBe(1123);
  });
});
```

**Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./migratePage"`

**Step 3: Implementierung schreiben**

Create `app/lib/migratePage.ts`:

```ts
import type {
  PageBackground,
  PageLayer,
  PageTemplate,
  StrokeElement,
  TableElement,
} from "~/types/document";
import { getPageSize } from "~/utils/pageTemplates";
import { computeBbox } from "./bbox";

/** Strichform der Spalte `pages.strokes` vor dem Element-Modell. */
interface LegacyStroke {
  id?: string;
  points: [number, number, number][];
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string;
}

/** Tabellenform der Spalte `pages.tables` vor dem Element-Modell. */
interface LegacyTable {
  id?: string;
  x: number;
  y: number;
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
}

/**
 * Eine `pages`-Zeile, wie sie auf der Platte liegen kann — alt, neu oder gemischt.
 * Alle Felder optional, weil die Zeile von einem Gerät mit älterer Extension-Version
 * stammen kann.
 */
export interface LegacyPageRow {
  layers?: PageLayer[] | null;
  background?: PageBackground | null;
  width?: number | null;
  height?: number | null;
  strokes?: LegacyStroke[] | null;
  tables?: LegacyTable[] | null;
  template?: string | null;
  backgroundImage?: string | null;
  orientation?: string | null;
}

export interface MigratedPage {
  layers: PageLayer[];
  background: PageBackground;
  width: number;
  height: number;
}

/** Fester Layer-Name für alles, was aus der Zeit vor den Layern stammt. */
export const DEFAULT_LAYER_NAME = "Ebene 1";
export const DEFAULT_LAYER_ID = "layer-0";
export const DEFAULT_PAPER_COLOR = "#ffffff";
export const DEFAULT_TEMPLATE: PageTemplate = "lined";

/** Deckkraft, die der alte Renderer für Hintergrundbilder fest verdrahtet hatte. */
export const LEGACY_BACKGROUND_OPACITY = 0.3;

export function emptyLayer(): PageLayer {
  return { id: DEFAULT_LAYER_ID, name: DEFAULT_LAYER_NAME, visible: true, locked: false, elements: [] };
}

function toStrokeElement(stroke: LegacyStroke, index: number): StrokeElement {
  const element: StrokeElement = {
    id: stroke.id ?? `legacy-stroke-${index}`,
    type: "stroke",
    points: stroke.points,
    color: stroke.color,
    size: stroke.size,
    tool: stroke.tool,
    brushPreset: stroke.brushPreset,
    bbox: [0, 0, 0, 0],
  };
  element.bbox = computeBbox(element);
  return element;
}

function toTableElement(table: LegacyTable, index: number): TableElement {
  const element: TableElement = {
    id: table.id ?? `legacy-table-${index}`,
    type: "table",
    x: table.x,
    y: table.y,
    columns: table.columns,
    rows: table.rows,
    columnWidths: table.columnWidths,
    rowHeights: table.rowHeights,
    bbox: [0, 0, 0, 0],
  };
  element.bbox = computeBbox(element);
  return element;
}

function buildLegacyBackground(row: LegacyPageRow): PageBackground {
  const background: PageBackground = {
    paperColor: DEFAULT_PAPER_COLOR,
    template: (row.template as PageTemplate | null) ?? DEFAULT_TEMPLATE,
  };
  if (row.backgroundImage) {
    background.overlay = {
      type: "image",
      source: { kind: "inline", dataUrl: row.backgroundImage },
      opacity: LEGACY_BACKGROUND_OPACITY,
    };
  }
  return background;
}

function buildLegacyLayer(row: LegacyPageRow): PageLayer {
  return {
    ...emptyLayer(),
    elements: [
      ...(row.strokes ?? []).map(toStrokeElement),
      ...(row.tables ?? []).map(toTableElement),
    ],
  };
}

/**
 * Übersetzt eine gespeicherte Seitenzeile ins Dokumentmodell.
 *
 * Rein und idempotent: eine bereits migrierte Zeile kommt unverändert zurück.
 * Wird beim Laden aufgerufen, nicht als Datenmigration — geschrieben wird das
 * Ergebnis erst, wenn die Seite ohnehin gespeichert wird.
 */
export function migratePageRow(row: LegacyPageRow): MigratedPage {
  const size = getPageSize(row.orientation ?? "portrait");
  const width = row.width ?? size.width;
  const height = row.height ?? size.height;
  const background = row.background ?? buildLegacyBackground(row);

  // Ein leeres Layer-Array ist kein "noch nicht migriert", sondern eine leergeräumte
  // Seite. Trotzdem braucht sie einen Layer, sonst kann niemand darauf zeichnen.
  const layers = row.layers
    ? (row.layers.length > 0 ? row.layers : [emptyLayer()])
    : [buildLegacyLayer(row)];

  return { layers, background, width, height };
}
```

**Step 4: Test laufen lassen**

Run: `pnpm test`
Expected: `14 passed` (6 aus Task 3, 8 neue)

**Step 5: Commit**

```bash
git add app/lib/migratePage.ts app/lib/migratePage.test.ts
git commit -m "feat(haex-notes): migrate legacy page rows to the layer model"
```

---

## Task 5: Schema erweitern und Migration erzeugen

**Files:**
- Modify: `apps/haex-notes/app/database/schemas/index.ts`
- Create: `apps/haex-notes/app/database/migrations/0004_*.sql` (Name wird generiert)

**Step 1: Schema anpassen**

Modify `app/database/schemas/index.ts`.

Import oben ergänzen — **relativer Pfad, kein `~`-Alias**: drizzle-kit liest diese Datei ohne Nuxt und kennt den Alias nicht.

```ts
import type { PageBackground, PageLayer } from "../../types/document";
```

In der `pages`-Tabelle nach `orientation` einfügen:

```ts
    /** Layer mit Elementen — Quelle der Wahrheit ab dem Element-Modell. */
    layers: text({ mode: "json" }).$type<PageLayer[]>(),
    /** Papierfarbe, Lineatur und optionales Bild-/PDF-Overlay. */
    background: text({ mode: "json" }).$type<PageBackground>(),
    /** Seitenmaße in px. Null = aus `orientation` ableiten. */
    width: integer(),
    height: integer(),
```

Nullable und ohne Default. Damit erzeugt drizzle-kit ein reines `ALTER TABLE … ADD`, und alte Zeilen liefern `null`, was `migratePageRow()` als Migrationsmarker nutzt.

Nach der `palettes`-Tabelle die Asset-Tabelle ergänzen:

```ts
/**
 * Assets — Metadaten zu Dateien auf dem Filesystem.
 *
 * Enthält bewusst keine Bytes: eine DB-Transaktion ist auf 100 MB begrenzt, und
 * Dateien gehören ins Dateisystem. Der Inhalt liegt unter
 * `<assetRoot>/<sha256[0:2]>/<sha256>.<ext>`.
 */
export const assets = sqliteTable(
  tableName("assets"),
  {
    id: text().primaryKey(),
    sha256: text().notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer().notNull(),
    ...timestamps,
  }
);
export type InsertAsset = typeof assets.$inferInsert;
export type SelectAsset = typeof assets.$inferSelect;
```

Am Ende der Datei die alten Inline-Typen durch Re-Exports ersetzen, damit bestehende Importe weiterlaufen. `StrokeData`, `PageTemplate`, `PageOrientation` und `PageTable` werden heute aus `~/database/schemas` importiert (u. a. in `PageCanvas.vue`, `TrashPagePreview.vue`, `notebook.ts`, `[id].vue`):

```ts
// Dokumenttypen liegen in app/types/document.ts. Re-Export, damit bestehende
// Importe aus "~/database/schemas" weiter funktionieren.
export type {
  BBox,
  ImageElement,
  ImageOverlay,
  ImageSource,
  LatexElement,
  PageBackground,
  PageElement,
  PageLayer,
  PageOrientation,
  PageTemplate,
  PdfOverlay,
  ShapeElement,
  ShapeKind,
  StrokeElement,
  TableElement,
  TextElement,
} from "../../types/document";

/** @deprecated Altbestand der Spalte `strokes`. Neuer Code nutzt StrokeElement. */
export interface StrokeData {
  id: string;
  points: [number, number, number][];
  color: string;
  size: number;
  tool: "brush" | "eraser";
  brushPreset?: string;
  brushTip?: "round" | "flat" | "chisel";
}

/** @deprecated Altbestand der Spalte `tables`. Neuer Code nutzt TableElement. */
export interface PageTable {
  id: string;
  x: number;
  y: number;
  columns: number;
  rows: number;
  columnWidths: number[];
  rowHeights: number[];
}
```

Die bisherigen Inline-Definitionen von `PageTemplate`, `PageOrientation` und `PenSlot` entfernen — bis auf `PenSlot`, das bleibt hier, weil es zur `pencil_case`-Tabelle gehört und kein Dokumenttyp ist.

**Step 2: Migration generieren**

Run: `pnpm db:generate`
Expected: eine neue Datei `app/database/migrations/0004_<name>.sql`

**Step 3: Generiertes SQL prüfen — das ist der kritische Schritt**

Run: `cat app/database/migrations/0004_*.sql`

Erwartet werden ausschließlich `ALTER TABLE … ADD` und ein `CREATE TABLE` für `assets`:

```sql
CREATE TABLE `…__haex-notes__assets` ( … );
--> statement-breakpoint
ALTER TABLE `…__haex-notes__pages` ADD `layers` text;--> statement-breakpoint
ALTER TABLE `…__haex-notes__pages` ADD `background` text;--> statement-breakpoint
ALTER TABLE `…__haex-notes__pages` ADD `width` integer;--> statement-breakpoint
ALTER TABLE `…__haex-notes__pages` ADD `height` integer;
```

**STOP, falls im SQL ein `DROP TABLE`, ein `__new_`-Präfix oder ein Table-Recreate auftaucht.** Die `pages`-Tabelle wird über den Shared-Space-Sync repliziert; ein Recreate zerstört den Sync-Zustand. In dem Fall die Migration von Hand auf reine `ADD COLUMN`-Statements umschreiben und die generierte `meta/*_snapshot.json` behalten (drizzle braucht sie für den nächsten Diff).

**Step 4: Typecheck**

Run: `pnpm exec vue-tsc --noEmit -p .`
Expected: keine neuen Fehler.

**Step 5: Commit**

```bash
git add app/database/schemas/index.ts app/database/migrations
git commit -m "feat(haex-notes): add layers, background, size columns and assets table"
```

---

## Task 6: Undo-Kommandos

Kommandos arbeiten auf einem einfachen `PageDoc`-Objekt, nicht auf dem Pinia-Store. Dadurch sind sie ohne Vue testbar, und der Store bleibt eine dünne Hülle.

**Files:**
- Create: `apps/haex-notes/app/lib/commands.ts`
- Test: `apps/haex-notes/app/lib/commands.test.ts`

**Step 1: Failing Test schreiben**

Create `app/lib/commands.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PageElement, StrokeElement } from "~/types/document";
import {
  addElements,
  addLayer,
  moveLayer,
  mutateElements,
  mutateLayer,
  removeElements,
  removeLayer,
  replaceElements,
  setPageBackground,
  type PageDoc,
} from "./commands";

const stroke = (id: string): StrokeElement => ({
  id,
  type: "stroke",
  points: [[0, 0, 0.5], [10, 10, 0.5]],
  color: "#000000",
  size: 2,
  tool: "brush",
  bbox: [-1, -1, 12, 12],
});

const doc = (...elements: PageElement[]): PageDoc => ({
  id: "p1",
  layers: [{ id: "l1", name: "Ebene 1", visible: true, locked: false, elements }],
  background: { paperColor: "#ffffff", template: "lined" },
  width: 794,
  height: 1123,
});

const ids = (page: PageDoc, layerIndex = 0) =>
  page.layers[layerIndex]!.elements.map((e) => e.id);

describe("addElements", () => {
  it("appends on apply and removes them again on revert", () => {
    const page = doc(stroke("a"));
    const cmd = addElements(page, "l1", [stroke("b")], "Strich");
    cmd.apply();
    expect(ids(page)).toEqual(["a", "b"]);
    cmd.revert();
    expect(ids(page)).toEqual(["a"]);
  });

  it("can be redone", () => {
    const page = doc();
    const cmd = addElements(page, "l1", [stroke("a")], "Strich");
    cmd.apply();
    cmd.revert();
    cmd.apply();
    expect(ids(page)).toEqual(["a"]);
  });
});

describe("removeElements", () => {
  it("restores removed elements at their original index", () => {
    const page = doc(stroke("a"), stroke("b"), stroke("c"));
    const cmd = removeElements(page, ["b"], "Löschen");
    cmd.apply();
    expect(ids(page)).toEqual(["a", "c"]);
    cmd.revert();
    expect(ids(page)).toEqual(["a", "b", "c"]);
  });

  it("restores several elements in the right order", () => {
    const page = doc(stroke("a"), stroke("b"), stroke("c"), stroke("d"));
    const cmd = removeElements(page, ["a", "c"], "Löschen");
    cmd.apply();
    expect(ids(page)).toEqual(["b", "d"]);
    cmd.revert();
    expect(ids(page)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("replaceElements", () => {
  it("swaps elements and restores the original on revert", () => {
    const page = doc(stroke("a"), stroke("b"));
    const cmd = replaceElements(page, "l1", ["a"], [stroke("x"), stroke("y")], "Radieren");
    cmd.apply();
    expect(ids(page)).toEqual(["b", "x", "y"]);
    cmd.revert();
    expect(ids(page)).toEqual(["a", "b"]);
  });
});

describe("mutateElements", () => {
  it("applies the mutation and restores the previous state", () => {
    const page = doc(stroke("a"));
    const cmd = mutateElements(page, ["a"], (el) => { el.bbox = [5, 5, 5, 5]; }, "Verschieben");
    cmd.apply();
    expect(page.layers[0]!.elements[0]!.bbox).toEqual([5, 5, 5, 5]);
    cmd.revert();
    expect(page.layers[0]!.elements[0]!.bbox).toEqual([-1, -1, 12, 12]);
  });

  it("replays every merged mutation on redo", () => {
    const page = doc(stroke("a"));
    const first = mutateElements(page, ["a"], (el) => { el.size += 1; }, "Größe", "drag");
    const second = mutateElements(page, ["a"], (el) => { el.size += 10; }, "Größe", "drag");

    first.apply();
    second.apply();
    first.merge!(second);
    expect((page.layers[0]!.elements[0] as StrokeElement).size).toBe(13);

    first.revert();
    expect((page.layers[0]!.elements[0] as StrokeElement).size).toBe(2);

    first.apply();
    expect((page.layers[0]!.elements[0] as StrokeElement).size).toBe(13);
  });
});

describe("layer commands", () => {
  it("adds and removes a layer", () => {
    const page = doc();
    const cmd = addLayer(page, { id: "l2", name: "Ebene 2", visible: true, locked: false, elements: [] }, undefined, "Ebene");
    cmd.apply();
    expect(page.layers.map((l) => l.id)).toEqual(["l1", "l2"]);
    cmd.revert();
    expect(page.layers.map((l) => l.id)).toEqual(["l1"]);
  });

  it("refuses to remove the last layer", () => {
    const page = doc();
    expect(() => removeLayer(page, "l1", "Ebene löschen")).toThrow();
  });

  it("moves a layer and puts it back", () => {
    const page = doc();
    page.layers.push({ id: "l2", name: "Ebene 2", visible: true, locked: false, elements: [] });
    const cmd = moveLayer(page, "l1", 1, "Ebene verschieben");
    cmd.apply();
    expect(page.layers.map((l) => l.id)).toEqual(["l2", "l1"]);
    cmd.revert();
    expect(page.layers.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("toggles layer visibility", () => {
    const page = doc();
    const cmd = mutateLayer(page, "l1", { visible: false }, "Ebene ausblenden");
    cmd.apply();
    expect(page.layers[0]!.visible).toBe(false);
    cmd.revert();
    expect(page.layers[0]!.visible).toBe(true);
  });
});

describe("setPageBackground", () => {
  it("swaps the background and restores the previous one", () => {
    const page = doc();
    const cmd = setPageBackground(page, { paperColor: "#fef3c7", template: "grid" }, "Hintergrund");
    cmd.apply();
    expect(page.background.template).toBe("grid");
    cmd.revert();
    expect(page.background.template).toBe("lined");
  });
});
```

**Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./commands"`

**Step 3: Implementierung schreiben**

Create `app/lib/commands.ts`:

```ts
import type { PageBackground, PageElement, PageLayer } from "~/types/document";

/**
 * Der veränderliche Seitenzustand, auf dem Kommandos arbeiten.
 *
 * Bewusst ein einfaches Objekt ohne Pinia und ohne Vue-Refs: dadurch sind die
 * Kommandos ohne Store testbar. Der Store hält diese Objekte und macht sie über
 * `reactive()` beobachtbar.
 */
export interface PageDoc {
  id: string;
  layers: PageLayer[];
  background: PageBackground;
  width: number;
  height: number;
}

export interface Command {
  label: string;
  pageId: string;
  apply(): void;
  revert(): void;
  /** Gesetzt, wenn aufeinanderfolgende Kommandos zu einer Geste gehören (z.B. ein Drag). */
  mergeKey?: string;
  /** Faltet `next` in dieses Kommando. Wird nur bei gleichem mergeKey aufgerufen. */
  merge?(next: Command): void;
}

type Mutator = (element: PageElement) => void;

interface MutateCommand extends Command {
  readonly mutators: Mutator[];
}

const clone = <T>(value: T): T => structuredClone(value);

function findLayer(page: PageDoc, layerId: string): PageLayer {
  const layer = page.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error(`Layer ${layerId} not found on page ${page.id}`);
  return layer;
}

/** Führt mehrere Kommandos als eines aus. Revert läuft in umgekehrter Reihenfolge. */
export function composite(label: string, pageId: string, ...commands: Command[]): Command {
  return {
    label,
    pageId,
    apply() {
      for (const command of commands) command.apply();
    },
    revert() {
      for (let i = commands.length - 1; i >= 0; i--) commands[i]!.revert();
    },
  };
}

export function addElements(
  page: PageDoc,
  layerId: string,
  elements: PageElement[],
  label: string,
): Command {
  const added = clone(elements);
  const addedIds = new Set(added.map((e) => e.id));
  return {
    label,
    pageId: page.id,
    apply() {
      findLayer(page, layerId).elements.push(...clone(added));
    },
    revert() {
      const layer = findLayer(page, layerId);
      layer.elements = layer.elements.filter((e) => !addedIds.has(e.id));
    },
  };
}

interface RemovedRef {
  layerId: string;
  index: number;
  element: PageElement;
}

export function removeElements(page: PageDoc, elementIds: string[], label: string): Command {
  let removed: RemovedRef[] = [];
  return {
    label,
    pageId: page.id,
    apply() {
      const wanted = new Set(elementIds);
      removed = [];
      for (const layer of page.layers) {
        // Rückwärts, damit das Splicen die noch nicht besuchten Indizes nicht verschiebt.
        for (let i = layer.elements.length - 1; i >= 0; i--) {
          const element = layer.elements[i]!;
          if (!wanted.has(element.id)) continue;
          removed.push({ layerId: layer.id, index: i, element: clone(element) });
          layer.elements.splice(i, 1);
        }
      }
    },
    revert() {
      // Aufsteigend einsetzen, damit jeder Index wieder dort landet, wo er herkam.
      for (const ref of [...removed].sort((a, b) => a.index - b.index)) {
        findLayer(page, ref.layerId).elements.splice(ref.index, 0, clone(ref.element));
      }
    },
  };
}

/** Ersetzt Elemente durch andere — für Radierer-Split, Formerkennung, Gruppierung. */
export function replaceElements(
  page: PageDoc,
  layerId: string,
  removeIds: string[],
  add: PageElement[],
  label: string,
): Command {
  return composite(
    label,
    page.id,
    removeElements(page, removeIds, label),
    addElements(page, layerId, add, label),
  );
}

/**
 * Ändert Elemente an Ort und Stelle. Deckt Verschieben, Skalieren, Rotieren,
 * Eigenschaftsänderungen und das Vertical-Space-Tool ab — deshalb gibt es dafür
 * keine eigenen Kommandos.
 *
 * Der Zustand vor der ersten Anwendung wird als Snapshot festgehalten; Revert
 * spielt ihn zurück. Bei gleichem `mergeKey` sammelt das erste Kommando die
 * Mutatoren der folgenden ein, sodass eine ganze Drag-Geste ein Undo-Schritt ist.
 */
export function mutateElements(
  page: PageDoc,
  elementIds: string[],
  mutate: Mutator,
  label: string,
  mergeKey?: string,
): MutateCommand {
  const mutators: Mutator[] = [mutate];
  let before: { layerId: string; element: PageElement }[] | null = null;

  const forEachTarget = (fn: (element: PageElement, layer: PageLayer) => void) => {
    const wanted = new Set(elementIds);
    for (const layer of page.layers) {
      for (const element of layer.elements) {
        if (wanted.has(element.id)) fn(element, layer);
      }
    }
  };

  return {
    label,
    pageId: page.id,
    mergeKey,
    mutators,
    apply() {
      if (before === null) {
        const snapshot: { layerId: string; element: PageElement }[] = [];
        forEachTarget((element, layer) => snapshot.push({ layerId: layer.id, element: clone(element) }));
        before = snapshot;
      }
      forEachTarget((element) => {
        for (const mutator of mutators) mutator(element);
      });
    },
    revert() {
      if (!before) return;
      for (const { layerId, element } of before) {
        const layer = findLayer(page, layerId);
        const index = layer.elements.findIndex((e) => e.id === element.id);
        if (index >= 0) layer.elements[index] = clone(element);
      }
    },
    merge(next) {
      // `next` wurde vom Stack bereits angewendet, der Dokumentzustand stimmt also.
      // Wir übernehmen nur seine Mutatoren, damit ein späteres Redo die ganze
      // Geste nachspielt.
      mutators.push(...(next as MutateCommand).mutators);
    },
  };
}

export function addLayer(
  page: PageDoc,
  layer: PageLayer,
  index: number | undefined,
  label: string,
): Command {
  const snapshot = clone(layer);
  const at = index ?? page.layers.length;
  return {
    label,
    pageId: page.id,
    apply() {
      page.layers.splice(at, 0, clone(snapshot));
    },
    revert() {
      page.layers = page.layers.filter((l) => l.id !== snapshot.id);
    },
  };
}

export function removeLayer(page: PageDoc, layerId: string, label: string): Command {
  if (page.layers.length <= 1) {
    throw new Error("Cannot remove the last layer of a page");
  }
  const index = page.layers.findIndex((l) => l.id === layerId);
  if (index < 0) throw new Error(`Layer ${layerId} not found on page ${page.id}`);
  const snapshot = clone(page.layers[index]!);
  return {
    label,
    pageId: page.id,
    apply() {
      page.layers = page.layers.filter((l) => l.id !== layerId);
    },
    revert() {
      page.layers.splice(index, 0, clone(snapshot));
    },
  };
}

export function moveLayer(page: PageDoc, layerId: string, toIndex: number, label: string): Command {
  const fromIndex = page.layers.findIndex((l) => l.id === layerId);
  if (fromIndex < 0) throw new Error(`Layer ${layerId} not found on page ${page.id}`);
  return {
    label,
    pageId: page.id,
    apply() {
      const [moved] = page.layers.splice(fromIndex, 1);
      page.layers.splice(toIndex, 0, moved!);
    },
    revert() {
      const [moved] = page.layers.splice(toIndex, 1);
      page.layers.splice(fromIndex, 0, moved!);
    },
  };
}

export function mutateLayer(
  page: PageDoc,
  layerId: string,
  patch: Partial<Pick<PageLayer, "name" | "visible" | "locked">>,
  label: string,
): Command {
  let before: Partial<PageLayer> | null = null;
  return {
    label,
    pageId: page.id,
    apply() {
      const layer = findLayer(page, layerId);
      if (before === null) {
        before = {};
        for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
          (before as Record<string, unknown>)[key] = layer[key];
        }
      }
      Object.assign(layer, patch);
    },
    revert() {
      if (before) Object.assign(findLayer(page, layerId), before);
    },
  };
}

export function setPageBackground(page: PageDoc, next: PageBackground, label: string): Command {
  const after = clone(next);
  let before: PageBackground | null = null;
  return {
    label,
    pageId: page.id,
    apply() {
      before ??= clone(page.background);
      page.background = clone(after);
    },
    revert() {
      if (before) page.background = clone(before);
    },
  };
}
```

**Step 4: Test laufen lassen**

Run: `pnpm test`
Expected: `26 passed`

**Step 5: Commit**

```bash
git add app/lib/commands.ts app/lib/commands.test.ts
git commit -m "feat(haex-notes): add undoable document commands"
```

---

## Task 7: Undo-Stack

**Files:**
- Create: `apps/haex-notes/app/lib/undoStack.ts`
- Test: `apps/haex-notes/app/lib/undoStack.test.ts`

**Step 1: Failing Test schreiben**

Create `app/lib/undoStack.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { createUndoStack } from "./undoStack";

/** Minimalkommando, das einen Zähler hoch- und wieder runterzählt. */
function counterCommand(state: { value: number }, delta: number, mergeKey?: string): Command {
  const deltas = [delta];
  return {
    label: `add ${delta}`,
    pageId: "p1",
    mergeKey,
    apply() {
      for (const d of deltas) state.value += d;
    },
    revert() {
      for (const d of deltas) state.value -= d;
    },
    merge(next) {
      deltas.push(...((next as unknown as { deltas: number[] }).deltas ?? []));
    },
    // Für den merge-Test von außen erreichbar.
    ...({ deltas } as object),
  } as Command;
}

describe("createUndoStack", () => {
  it("applies a command when it is pushed", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 5));
    expect(state.value).toBe(5);
    expect(stack.canUndo.value).toBe(true);
    expect(stack.canRedo.value).toBe(false);
  });

  it("undoes and redoes", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 5));
    stack.undo();
    expect(state.value).toBe(0);
    expect(stack.canRedo.value).toBe(true);
    stack.redo();
    expect(state.value).toBe(5);
  });

  it("drops the redo tail when a new command arrives after an undo", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 5));
    stack.push(counterCommand(state, 3));
    stack.undo();
    stack.push(counterCommand(state, 100));
    expect(state.value).toBe(105);
    expect(stack.canRedo.value).toBe(false);
  });

  it("coalesces consecutive commands with the same merge key", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 1, "drag"));
    stack.push(counterCommand(state, 2, "drag"));
    stack.push(counterCommand(state, 4, "drag"));
    expect(state.value).toBe(7);

    stack.undo();
    expect(state.value).toBe(0);
    expect(stack.canUndo.value).toBe(false);
  });

  it("does not coalesce across different merge keys", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 1, "drag-a"));
    stack.push(counterCommand(state, 2, "drag-b"));
    stack.undo();
    expect(state.value).toBe(1);
  });

  it("caps the stack depth and drops the oldest entry", () => {
    const state = { value: 0 };
    const stack = createUndoStack(2);
    stack.push(counterCommand(state, 1));
    stack.push(counterCommand(state, 2));
    stack.push(counterCommand(state, 4));
    expect(stack.commands.value).toHaveLength(2);
    stack.undo();
    stack.undo();
    // Der erste Schritt ist nicht mehr rücknehmbar.
    expect(state.value).toBe(1);
    expect(stack.canUndo.value).toBe(false);
  });

  it("clears", () => {
    const state = { value: 0 };
    const stack = createUndoStack();
    stack.push(counterCommand(state, 5));
    stack.clear();
    expect(stack.canUndo.value).toBe(false);
    expect(stack.commands.value).toHaveLength(0);
  });
});
```

**Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./undoStack"`

**Step 3: Implementierung schreiben**

Create `app/lib/undoStack.ts`:

```ts
import { computed, ref, shallowRef } from "vue";
import type { Command } from "./commands";

/**
 * Obergrenze der Undo-Tiefe. Kommandos halten Snapshots der betroffenen Elemente;
 * ohne Deckel wächst der Speicher über eine lange Sitzung unbegrenzt.
 */
export const MAX_UNDO_DEPTH = 100;

/**
 * Notizbuchweiter Undo-Stack.
 *
 * Bewusst nicht seitenweit: mit Continuous Scroll (Phase 5) wäre ein Stack pro
 * Seite verwirrend, und Xournal++ macht es genauso. Jedes Kommando trägt seine
 * pageId, damit die UI beim Undo zur richtigen Seite springen kann.
 *
 * Importiert `vue` explizit statt sich auf Nuxt-Autoimports zu verlassen, damit
 * die Unit-Tests ohne Nuxt laufen.
 */
export function createUndoStack(maxDepth: number = MAX_UNDO_DEPTH) {
  const commands = shallowRef<Command[]>([]);
  const index = ref(-1);

  const push = (command: Command) => {
    command.apply();

    // Alles hinter dem Cursor ist durch den neuen Zweig überholt.
    const next = commands.value.slice(0, index.value + 1);
    const top = next[next.length - 1];

    if (top && command.mergeKey && top.mergeKey === command.mergeKey && top.merge) {
      top.merge(command);
    } else {
      next.push(command);
      while (next.length > maxDepth) next.shift();
    }

    commands.value = next;
    index.value = next.length - 1;
  };

  const undo = (): Command | null => {
    if (index.value < 0) return null;
    const command = commands.value[index.value]!;
    command.revert();
    index.value--;
    return command;
  };

  const redo = (): Command | null => {
    if (index.value >= commands.value.length - 1) return null;
    index.value++;
    const command = commands.value[index.value]!;
    command.apply();
    return command;
  };

  const clear = () => {
    commands.value = [];
    index.value = -1;
  };

  return {
    commands: computed(() => commands.value),
    canUndo: computed(() => index.value >= 0),
    canRedo: computed(() => index.value < commands.value.length - 1),
    undoLabel: computed(() => commands.value[index.value]?.label ?? null),
    redoLabel: computed(() => commands.value[index.value + 1]?.label ?? null),
    push,
    undo,
    redo,
    clear,
  };
}

export type UndoStack = ReturnType<typeof createUndoStack>;
```

**Step 4: Test laufen lassen**

Run: `pnpm test`
Expected: `33 passed`

**Step 5: Commit**

```bash
git add app/lib/undoStack.ts app/lib/undoStack.test.ts
git commit -m "feat(haex-notes): add notebook-wide undo stack"
```

---

## Task 8: Element-Rendering an einer Stelle bündeln

`PageCanvas.vue` und `TrashPagePreview.vue` enthalten heute je eine eigene Kopie von `getSvgPathFromStroke` und `renderStroke`. Beide müssen auf das Element-Modell umgestellt werden — vorher werden sie zusammengeführt, sonst wird derselbe Umbau zweimal geschrieben.

**Files:**
- Create: `apps/haex-notes/app/lib/render/elements.ts`
- Test: `apps/haex-notes/app/lib/render/elements.test.ts`

**Step 1: Failing Test für den Pfadbau schreiben**

Nur `strokeToPath` ist ohne Canvas testbar; die Zeichenfunktionen selbst werden in Task 15 manuell abgenommen.

Create `app/lib/render/elements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { strokeOutlineToPath } from "./elements";

describe("strokeOutlineToPath", () => {
  it("returns an empty string for fewer than two points", () => {
    expect(strokeOutlineToPath([])).toBe("");
    expect(strokeOutlineToPath([[0, 0]])).toBe("");
  });

  it("starts with a move and closes the path", () => {
    const path = strokeOutlineToPath([[0, 0], [10, 0], [10, 10]]);
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});
```

**Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./elements"`

**Step 3: Renderer-Modul schreiben**

Create `app/lib/render/elements.ts`. Die Stroke-Logik wird 1:1 aus [PageCanvas.vue:32-69](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L32-L69) übernommen, die Tabellenlogik aus [PageCanvas.vue:118-150](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L118-L150):

```ts
import getStroke from "perfect-freehand";
import type { PageElement, StrokeElement, TableElement } from "~/types/document";

/** Wandelt den Umriss aus perfect-freehand in einen geschlossenen SVG-Pfad. */
export function strokeOutlineToPath(outline: [number, number][]): string {
  if (outline.length < 2) return "";
  const parts: string[] = [];
  const first = outline[0]!;
  parts.push(`M ${first[0]} ${first[1]}`);
  for (let i = 1; i < outline.length; i++) {
    const point = outline[i]!;
    if (i === 1) {
      parts.push(`L ${point[0]} ${point[1]}`);
    } else {
      const prev = outline[i - 1]!;
      parts.push(`Q ${prev[0]} ${prev[1]} ${(prev[0] + point[0]) / 2} ${(prev[1] + point[1]) / 2}`);
    }
  }
  parts.push("Z");
  return parts.join(" ");
}

/** SVG-Pfad eines Strichs. Wird in Phase 4 auch vom PDF-Export genutzt. */
export function strokeToPath(stroke: StrokeElement): string {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: stroke.tool === "eraser" ? 0 : 0.3,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  });
  return strokeOutlineToPath(outline as [number, number][]);
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeElement) {
  const path = strokeToPath(stroke);
  if (!path) return;
  ctx.save();
  if (stroke.brushPreset === "marker" || stroke.brushPreset === "highlighter") {
    ctx.globalAlpha = 0.35;
  }
  ctx.fillStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
  ctx.fill(new Path2D(path));
  ctx.restore();
}

function drawTable(ctx: CanvasRenderingContext2D, table: TableElement) {
  ctx.save();
  ctx.strokeStyle = "rgba(100, 120, 150, 0.5)";
  ctx.lineWidth = 1;

  const totalWidth = table.columnWidths.reduce((a, b) => a + b, 0);
  const totalHeight = table.rowHeights.reduce((a, b) => a + b, 0);

  ctx.strokeRect(table.x, table.y, totalWidth, totalHeight);

  let cx = table.x;
  for (let c = 0; c < table.columns - 1; c++) {
    cx += table.columnWidths[c]!;
    ctx.beginPath();
    ctx.moveTo(cx, table.y);
    ctx.lineTo(cx, table.y + totalHeight);
    ctx.stroke();
  }

  let cy = table.y;
  for (let r = 0; r < table.rows - 1; r++) {
    cy += table.rowHeights[r]!;
    ctx.beginPath();
    ctx.moveTo(table.x, cy);
    ctx.lineTo(table.x + totalWidth, cy);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Zeichnet ein Element. Text, Bild, Form und LaTeX kommen in den Phasen 3 und 6
 * dazu — bis dahin werden sie still übersprungen, damit eine von einem neueren
 * Gerät synchronisierte Seite nicht den ganzen Renderer wirft.
 */
export function drawElement(ctx: CanvasRenderingContext2D, element: PageElement) {
  switch (element.type) {
    case "stroke":
      drawStroke(ctx, element);
      return;
    case "table":
      drawTable(ctx, element);
      return;
    default:
      return;
  }
}

export function drawElements(ctx: CanvasRenderingContext2D, elements: readonly PageElement[]) {
  for (const element of elements) drawElement(ctx, element);
}
```

**Step 4: Test laufen lassen**

Run: `pnpm test`
Expected: `35 passed`

**Step 5: Commit**

```bash
git add app/lib/render/elements.ts app/lib/render/elements.test.ts
git commit -m "refactor(haex-notes): extract shared element rendering"
```

---

## Task 9: notebook-Store auf Layer und Kommandos umstellen

Der größte Einzelschritt. Der Store hört auf, den Dokumentzustand aus der Undo-History abzuleiten.

**Files:**
- Modify: `apps/haex-notes/app/stores/notebook.ts`

**Step 1: Dokumentzustand einführen**

Ganz oben die neuen Importe ergänzen:

```ts
import { reactive } from "vue";
import type { PageElement, PageLayer, StrokeElement } from "~/types/document";
import {
  addElements,
  mutateElements,
  removeElements,
  type Command,
  type PageDoc,
} from "~/lib/commands";
import { computeBbox } from "~/lib/bbox";
import { emptyLayer, migratePageRow } from "~/lib/migratePage";
import { createUndoStack } from "~/lib/undoStack";
```

Innerhalb von `defineStore` die History-Blöcke ([Zeilen 17-55](../../apps/haex-notes/app/stores/notebook.ts#L17-L55)) ersetzen durch:

```ts
  /** Dokumentzustand je Seite, aufgebaut beim ersten Öffnen der Seite. */
  const docs = reactive(new Map<string, PageDoc>());
  const undoStack = createUndoStack();

  const currentDoc = computed(() => {
    const page = currentPage.value;
    return page ? docs.get(page.id) ?? null : null;
  });

  /** Aktiver Layer für neue Elemente. In Phase 2 vom Layer-Panel gesetzt. */
  const activeLayerId = ref<string | null>(null);

  const activeLayer = computed<PageLayer | null>(() => {
    const doc = currentDoc.value;
    if (!doc) return null;
    return doc.layers.find((l) => l.id === activeLayerId.value) ?? doc.layers[0] ?? null;
  });

  /** Elemente aller sichtbaren Layer, in Zeichenreihenfolge. */
  const visibleElements = computed<PageElement[]>(() => {
    const doc = currentDoc.value;
    if (!doc) return [];
    return doc.layers.filter((l) => l.visible).flatMap((l) => l.elements);
  });

  /** Live gezeichneter Strich, noch nicht committet. */
  const currentStroke = ref<StrokeElement | null>(null);
  const isDrawing = ref(false);

  const runCommand = (command: Command) => {
    undoStack.push(command);
    isDirty.value = true;
  };

  const undo = () => {
    if (undoStack.undo()) isDirty.value = true;
  };
  const redo = () => {
    if (undoStack.redo()) isDirty.value = true;
  };
```

`canUndo` / `canRedo` durch die Computeds des Stacks ersetzen:

```ts
  const canUndo = undoStack.canUndo;
  const canRedo = undoStack.canRedo;
```

**Step 2: Seiten laden**

`loadPageIntoState` ([Zeilen 116-126](../../apps/haex-notes/app/stores/notebook.ts#L116-L126)) ersetzen:

```ts
  const loadPageIntoState = () => {
    const page = currentPage.value;
    if (!page) return;
    if (!docs.has(page.id)) {
      const migrated = migratePageRow(page);
      docs.set(page.id, { id: page.id, ...migrated });
    }
    activeLayerId.value = docs.get(page.id)!.layers[0]!.id;
    isDirty.value = false;
  };
```

Der Undo-Stack wird hier **nicht** geleert — er ist notizbuchweit. Geleert wird er in `clear()`.

**Step 3: Strich- und Tabellenaktionen auf Kommandos umstellen**

`addStroke` ersetzen:

```ts
  const addStroke = (stroke: StrokeElement, label: string) => {
    const doc = currentDoc.value;
    const layer = activeLayer.value;
    if (!doc || !layer) return;
    stroke.bbox = computeBbox(stroke);
    runCommand(addElements(doc, layer.id, [stroke], label));
  };
```

Die sechs Tabellenfunktionen ([Zeilen 272-324](../../apps/haex-notes/app/stores/notebook.ts#L272-L324)) ersetzen. Sie werden dadurch zum ersten Mal undobar:

```ts
  const tableElements = computed(() =>
    visibleElements.value.filter((e): e is TableElement => e.type === "table"),
  );

  const addTable = (rows: number, cols: number, x: number, y: number) => {
    const doc = currentDoc.value;
    const layer = activeLayer.value;
    if (!doc || !layer) return null;

    const table: TableElement = {
      id: crypto.randomUUID(),
      type: "table",
      x,
      y,
      columns: cols,
      rows,
      columnWidths: Array(cols).fill(80),
      rowHeights: Array(rows).fill(30),
      bbox: [0, 0, 0, 0],
    };
    table.bbox = computeBbox(table);
    runCommand(addElements(doc, layer.id, [table], "Tabelle"));
    return table;
  };

  const removeTable = (id: string) => {
    const doc = currentDoc.value;
    if (!doc) return;
    runCommand(removeElements(doc, [id], "Tabelle löschen"));
  };

  /** Gemeinsamer Weg für alle Tabellenänderungen: ein mutate-Kommando. */
  const mutateTable = (id: string, label: string, mutate: (t: TableElement) => void, mergeKey?: string) => {
    const doc = currentDoc.value;
    if (!doc) return;
    runCommand(
      mutateElements(
        doc,
        [id],
        (element) => {
          if (element.type !== "table") return;
          mutate(element);
          element.bbox = computeBbox(element);
        },
        label,
        mergeKey,
      ),
    );
  };

  const addTableRow = (id: string) =>
    mutateTable(id, "Zeile hinzufügen", (t) => { t.rows++; t.rowHeights.push(30); });

  const addTableColumn = (id: string) =>
    mutateTable(id, "Spalte hinzufügen", (t) => { t.columns++; t.columnWidths.push(80); });

  const removeTableRow = (id: string) =>
    mutateTable(id, "Zeile entfernen", (t) => {
      if (t.rows <= 1) return;
      t.rows--;
      t.rowHeights.pop();
    });

  const removeTableColumn = (id: string) =>
    mutateTable(id, "Spalte entfernen", (t) => {
      if (t.columns <= 1) return;
      t.columns--;
      t.columnWidths.pop();
    });

  /**
   * Live-Feedback beim Ziehen einer Tabellenlinie. Alle Aufrufe einer Geste teilen
   * sich denselben mergeKey und werden zu einem Undo-Schritt.
   */
  const resizeTable = (id: string, gestureId: string, mutate: (t: TableElement) => void) =>
    mutateTable(id, "Tabelle anpassen", mutate, `table-resize:${gestureId}`);
```

`TableElement` zum Typ-Import in Zeile 2 ergänzen.

**Step 4: Speichern umstellen**

`saveCurrentPageAsync` ersetzen:

```ts
  const saveCurrentPageAsync = async () => {
    const db = haexVault.orm;
    const page = currentPage.value;
    const doc = currentDoc.value;
    if (!db || !page || !doc) return;

    // structuredClone entfernt die Vue-Proxies; Drizzle serialisiert sonst
    // Reactive-Wrapper mit in das JSON.
    await db
      .update(pages)
      .set({
        layers: structuredClone(toRaw(doc.layers)),
        background: structuredClone(toRaw(doc.background)),
        width: doc.width,
        height: doc.height,
      })
      .where(eq(pages.id, page.id));
    isDirty.value = false;
  };
```

`toRaw` aus `vue` importieren.

Die Spalten `strokes`, `tables`, `template` und `background_image` werden bewusst nicht mehr geschrieben — siehe Design-Dokument, Abschnitt „Schema-Änderungen".

**Step 5: `clear` und `togglePageOrientationAsync` anpassen**

```ts
  const clear = () => {
    currentNotebook.value = null;
    currentPages.value = [];
    currentPageIndex.value = 0;
    docs.clear();
    undoStack.clear();
    currentStroke.value = null;
    isDrawing.value = false;
    isDirty.value = false;
    activeLayerId.value = null;
  };
```

`togglePageOrientationAsync` schreibt jetzt Breite und Höhe statt `orientation`:

```ts
  const togglePageOrientationAsync = async () => {
    const doc = currentDoc.value;
    if (!doc) return;
    const [width, height] = [doc.height, doc.width];
    doc.width = width;
    doc.height = height;
    isDirty.value = true;
    await saveCurrentPageAsync();
  };
```

`changePageTemplateAsync` schreibt in den Hintergrund statt in die Spalte:

```ts
  const changePageTemplateAsync = async (template: PageTemplate) => {
    const doc = currentDoc.value;
    if (!doc) return;
    runCommand(setPageBackground(doc, { ...doc.background, template }, "Vorlage"));
    await saveCurrentPageAsync();
  };
```

`setPageBackground` zum Import aus `~/lib/commands` ergänzen.

**Step 6: Rückgabeobjekt anpassen**

Im `return`-Block entfernen: `strokes`, `history`, `historyIndex`, `pageTables`.
Ergänzen: `currentDoc`, `visibleElements`, `activeLayer`, `activeLayerId`, `tableElements`, `resizeTable`, `undoStack`.

`currentStroke`, `isDrawing`, `addStroke`, `undo`, `redo`, `canUndo`, `canRedo` bleiben unter denselben Namen — dadurch bleiben die meisten Aufrufstellen unverändert.

**Step 7: Typecheck**

Run: `pnpm exec vue-tsc --noEmit -p .`
Expected: Fehler **nur** in `PageCanvas.vue`, `TrashPagePreview.vue` und `pages/notebook/[id].vue` — die werden in den Tasks 10 bis 12 behoben. Fehler in `notebook.ts` selbst müssen weg sein.

**Step 8: Commit**

```bash
git add app/stores/notebook.ts
git commit -m "feat(haex-notes): move notebook store to layer model and command undo"
```

---

## Task 10: PageCanvas auf drei Ebenen und Dirty-Flags umbauen

**Files:**
- Modify: `apps/haex-notes/app/components/notes/PageCanvas.vue`

**Step 1: Dauer-Loop durch einen Scheduler ersetzen**

[Zeilen 172-179](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L172-L179) ersetzen:

```ts
type Layer = "bg" | "content" | "overlay";

const dirty = new Set<Layer>(["bg", "content", "overlay"]);
let frameId = 0;

/** Markiert Ebenen als neu zu zeichnen und fordert genau einen Frame an. */
const scheduleRender = (...layers: Layer[]) => {
  for (const layer of layers) dirty.add(layer);
  if (frameId) return;
  frameId = requestAnimationFrame(() => {
    frameId = 0;
    const todo = new Set(dirty);
    dirty.clear();
    if (todo.has("bg")) renderBackground();
    if (todo.has("content")) renderContent();
    if (todo.has("overlay")) renderOverlay();
  });
};

onUnmounted(() => {
  if (frameId) cancelAnimationFrame(frameId);
});
```

**Step 2: Drei Canvas-Elemente statt einem**

Das `<template>` ersetzen. Alle drei liegen deckungsgleich; nur das oberste nimmt Pointer-Events entgegen:

```html
  <div ref="hostEl" class="relative h-full w-full">
    <canvas ref="bgCanvasEl" class="absolute inset-0 h-full w-full" />
    <canvas ref="contentCanvasEl" class="absolute inset-0 h-full w-full" />
    <canvas
      ref="overlayCanvasEl"
      class="absolute inset-0 h-full w-full touch-none"
      style="cursor: crosshair"
    />
    <!-- Tabellen-Kontextmenü bleibt unverändert -->
  </div>
```

Die drei Refs anlegen und `canvasEl` in den Input-Handlern durch `overlayCanvasEl` ersetzen — die Event-Listener hängen ab jetzt an der obersten Ebene.

**Step 3: Render-Funktionen aufteilen**

`render()` in drei Funktionen zerlegen. Gemeinsame Vorbereitung in einen Helfer:

```ts
/** Setzt Canvas-Größe und Viewport-Transform, gibt den vorbereiteten Kontext zurück. */
function prepare(el: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!el) return null;
  const ctx = el.getContext("2d");
  if (!ctx) return null;

  const dpr = window.devicePixelRatio || 1;
  const cw = el.clientWidth;
  const ch = el.clientHeight;
  if (el.width !== cw * dpr || el.height !== ch * dpr) {
    el.width = cw * dpr;
    el.height = ch * dpr;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.setTransform(
    dpr * viewport.zoom, 0,
    0, dpr * viewport.zoom,
    dpr * viewport.x, dpr * viewport.y,
  );
  return ctx;
}
```

`renderBackground()` übernimmt aus dem alten `render()` den grauen Rand, das Papierrechteck, `renderPageTemplate` und das Overlay-Bild — jetzt aus `doc.background` statt aus `page.template` / `page.backgroundImage`, und mit `background.paperColor` statt hart `#ffffff`, sowie `overlay.opacity` statt hart `0.3`.

Der graue Rand muss vor dem Setzen der Transform gezeichnet werden und gehört nur auf die unterste Ebene; die beiden oberen bleiben transparent (`clearRect`).

`renderContent()` zeichnet die committeten Elemente:

```ts
function renderContent() {
  const ctx = prepare(contentCanvasEl.value);
  if (!ctx) return;
  drawElements(ctx, notebook.visibleElements);
}
```

`renderOverlay()` zeichnet nur den laufenden Strich (Selektion und Werkzeug-Feedback kommen in Phase 2 dazu):

```ts
function renderOverlay() {
  const ctx = prepare(overlayCanvasEl.value);
  if (!ctx) return;
  if (notebook.currentStroke) drawElement(ctx, notebook.currentStroke);
}
```

`drawElement` und `drawElements` aus `~/lib/render/elements` importieren; die lokalen Kopien von `getSvgPathFromStroke` und `renderStroke` löschen.

**Step 4: Auslöser verdrahten**

Statt eines Dauerloops feuert jetzt jede Änderung gezielt:

```ts
watch(() => notebook.currentDoc?.background, () => scheduleRender("bg"), { deep: true });
watch(() => notebook.visibleElements, () => scheduleRender("content"), { deep: true });
watch(() => [viewport.x, viewport.y, viewport.zoom], () => scheduleRender("bg", "content", "overlay"));
watch(pageSize, () => nextTick(() => { fitPage(); scheduleRender("bg", "content", "overlay"); }));
useResizeObserver(hostEl, () => scheduleRender("bg", "content", "overlay"));
onMounted(() => { nextTick(() => { fitPage(); scheduleRender("bg", "content", "overlay"); }); });
```

`useResizeObserver` aus `@vueuse/core` importieren. In `onPointerMove` nach jedem Punkt am laufenden Strich `scheduleRender("overlay")` aufrufen, in `onPointerUp` nach dem Commit `scheduleRender("content", "overlay")`.

**Step 5: pageSize aus dem Dokument beziehen**

[Zeilen 11-15](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L11-L15) ersetzen:

```ts
const pageSize = computed(() => {
  const doc = notebook.currentDoc;
  return { width: doc?.width ?? PAGE_SIZE.width, height: doc?.height ?? PAGE_SIZE.height };
});
```

**Step 6: Tabellen-Interaktion auf Kommandos umstellen**

`notebook.pageTables` durch `notebook.tableElements` ersetzen. Im Drag-Handler ([Zeilen 322-339](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L322-L339)) nicht mehr direkt mutieren, sondern `notebook.resizeTable(...)` mit einer pro Geste konstanten `gestureId` (z.B. der `pointerId` als String) aufrufen. In `onPointerDown` beim Treffer eine `gestureId` erzeugen und in `tableDrag` mitführen.

**Step 7: Neuen Strich als StrokeElement erzeugen**

In `onPointerDown` ([Zeilen 300-307](../../apps/haex-notes/app/components/notes/PageCanvas.vue#L300-L307)) `type: "stroke"` und `bbox` ergänzen:

```ts
  notebook.currentStroke = {
    id: crypto.randomUUID(),
    type: "stroke",
    points: [[page.x, page.y, pressure]],
    color: slot.color,
    size: slot.size,
    tool: slot.type === "eraser" ? "eraser" : "brush",
    brushPreset: PEN_TYPE_TO_PRESET[slot.type] ?? "fine-tip",
    bbox: [0, 0, 0, 0],
  };
```

**Step 8: Manuell prüfen**

Run: `pnpm dev` und die Extension in haex-vault öffnen.

Zu prüfen:
- Ein Bestandsnotizbuch zeigt alle Striche und Tabellen wie vorher.
- Zeichnen fühlt sich unverändert an.
- Im Leerlauf (Zeiger still) zeigt das Performance-Panel der DevTools **keine** wiederkehrende Frame-Aktivität mehr.
- Zoom und Pan zeichnen alle drei Ebenen deckungsgleich neu.

**Step 9: Commit**

```bash
git add app/components/notes/PageCanvas.vue
git commit -m "perf(haex-notes): render page on three cached canvas layers"
```

---

## Task 11: TrashPagePreview auf das neue Modell

**Files:**
- Modify: `apps/haex-notes/app/components/notes/TrashPagePreview.vue`

**Step 1: Duplizierte Renderfunktionen entfernen**

`getSvgPathFromStroke` und `renderStroke` löschen, stattdessen importieren:

```ts
import { drawElements } from "~/lib/render/elements";
import { migratePageRow } from "~/lib/migratePage";
```

**Step 2: Seite über die Migration lesen**

Eine Seite im Papierkorb kann alt oder neu sein — `migratePageRow` deckt beides ab:

```ts
const doc = computed(() => migratePageRow(props.page));
```

Im `render()` `renderPageTemplate(ctx, doc.value.background.template, …)` verwenden und die Striche durch
`drawElements(ctx, doc.value.layers.filter(l => l.visible).flatMap(l => l.elements))` ersetzen.
Papierfarbe aus `doc.value.background.paperColor`, Seitenmaße aus `doc.value.width` / `.height` statt `PAGE_SIZE`.

**Step 3: Typecheck**

Run: `pnpm exec vue-tsc --noEmit -p .`
Expected: keine Fehler mehr in `TrashPagePreview.vue`.

**Step 4: Manuell prüfen**

Eine Seite löschen, im Papierkorb die Vorschau öffnen: Striche und Tabellen erscheinen.

**Step 5: Commit**

```bash
git add app/components/notes/TrashPagePreview.vue
git commit -m "refactor(haex-notes): render trash preview from the layer model"
```

---

## Task 12: Notebook-Seite an den neuen Store anpassen

`pages/notebook/[id].vue` greift an zwei Stellen direkt auf `notebook.history` und `notebook.historyIndex` zu. Beide gibt es nicht mehr.

**Files:**
- Modify: `apps/haex-notes/app/pages/notebook/[id].vue:43-59`
- Modify: `apps/haex-notes/app/pages/notebook/[id].vue:455-468`

**Step 1: `restorePreviewedPage` vereinfachen**

Der bisherige Block baut die History von Hand nach. Mit dem neuen Store genügt der normale Ladeweg:

```ts
const restorePreviewedPage = async () => {
  if (!trashPreviewPage.value) return;
  const restoredId = trashPreviewPage.value.id;
  await notebook.restorePageAsync(restoredId);
  trashPreviewPage.value = null;
  const index = notebook.currentPages.findIndex((p) => p.id === restoredId);
  if (index >= 0) await notebook.goToPage(index);
};
```

Das `console.log` in Zeile 50 entfällt mit.

**Step 2: `trash-restored`-Handler im Template genauso kürzen**

```html
          @trash-restored="async (pageId: string) => {
            const wasPreviewingThis = trashPreviewPage?.id === pageId;
            trashPreviewPage = null;
            if (!wasPreviewingThis) return;
            const index = notebook.currentPages.findIndex(p => p.id === pageId);
            if (index >= 0) await notebook.goToPage(index);
          }"
```

**Step 3: Typecheck und Lint**

Run: `pnpm exec vue-tsc --noEmit -p .`
Expected: keine Fehler.

Run: `pnpm exec eslint app --max-warnings 0`
Expected: keine Fehler in den in dieser Phase geänderten Dateien. Vorbestehende Meldungen in nicht angefasstem Code **nicht** mitreparieren.

**Step 4: Commit**

```bash
git add app/pages/notebook/\[id\].vue
git commit -m "refactor(haex-notes): drop direct history access from notebook page"
```

---

## Task 13: Asset-Pfade und Manifest

**Files:**
- Create: `apps/haex-notes/app/lib/assetPath.ts`
- Test: `apps/haex-notes/app/lib/assetPath.test.ts`
- Modify: `apps/haex-notes/haextension/manifest.json`

**Step 1: Failing Test schreiben**

Create `app/lib/assetPath.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assetRelPath, extensionFor, sha256Hex } from "./assetPath";

describe("sha256Hex", () => {
  it("hashes empty input to the known SHA-256 of the empty string", async () => {
    await expect(sha256Hex(new Uint8Array())).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is stable for the same bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await expect(sha256Hex(bytes)).resolves.toBe(await sha256Hex(bytes));
  });
});

describe("extensionFor", () => {
  it("maps known mime types", () => {
    expect(extensionFor("application/pdf")).toBe("pdf");
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("IMAGE/PNG")).toBe("png");
  });

  it("falls back to the file name", () => {
    expect(extensionFor("application/octet-stream", "scan.tiff")).toBe("tiff");
  });

  it("falls back to bin for unusable input", () => {
    expect(extensionFor("application/octet-stream")).toBe("bin");
    expect(extensionFor("application/octet-stream", "no-extension")).toBe("bin");
    expect(extensionFor("application/octet-stream", "weird.this-is-not-an-ext")).toBe("bin");
  });
});

describe("assetRelPath", () => {
  it("shards by the first two hash characters", () => {
    expect(assetRelPath("abcdef1234", "pdf")).toBe("ab/abcdef1234.pdf");
  });
});
```

**Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./assetPath"`

**Step 3: Implementierung schreiben**

Create `app/lib/assetPath.ts`:

```ts
/**
 * Reine Helfer für den Asset-Store. Die Dateizugriffe selbst liegen in
 * useAssetStore — hier steht nur, was ohne Filesystem testbar ist.
 */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};

export function extensionFor(mimeType: string, fileName?: string): string {
  const known = EXTENSION_BY_MIME[mimeType.toLowerCase()];
  if (known) return known;

  const parts = fileName?.split(".") ?? [];
  const candidate = parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(candidate) ? candidate : "bin";
}

/**
 * Pfad einer Datei relativ zum Asset-Wurzelverzeichnis.
 *
 * Der Zwei-Zeichen-Shard verhindert, dass ein einzelnes Verzeichnis zehntausende
 * Einträge bekommt — das ist auf manchen Dateisystemen spürbar langsam.
 */
export function assetRelPath(sha256: string, extension: string): string {
  return `${sha256.slice(0, 2)}/${sha256}.${extension}`;
}
```

**Step 4: Test laufen lassen**

Run: `pnpm test`
Expected: `43 passed`

**Step 5: Manifest auf readWrite**

Modify `haextension/manifest.json`:

```diff
     "filesystem": [
       {
         "target": "*",
-        "operation": "read"
+        "operation": "readWrite"
       }
     ],
```

**Step 6: Commit**

```bash
git add app/lib/assetPath.ts app/lib/assetPath.test.ts haextension/manifest.json
git commit -m "feat(haex-notes): add asset path helpers and request filesystem write"
```

---

## Task 14: Asset-Store

Dieser Task hat bewusst keine Unit-Tests: alles Testbare liegt in `assetPath.ts`, der Rest sind SDK-Aufrufe. Ein Mock der gesamten `FilesystemAPI` würde nur die Implementierung nachbauen und nichts beweisen.

**Files:**
- Create: `apps/haex-notes/app/composables/useAssetStore.ts`

**Step 1: Composable schreiben**

Create `app/composables/useAssetStore.ts`:

```ts
import { eq } from "drizzle-orm";
import { assets, type SelectAsset } from "~/database/schemas";
import { assetRelPath, extensionFor, sha256Hex } from "~/lib/assetPath";

/** Verzeichnis unterhalb des Dokumenten-Ordners. */
const ASSET_DIR = "haex-notes/assets";

/**
 * Dateien einer Notiz auf dem Filesystem.
 *
 * Die DB hält nur Metadaten — eine DB-Transaktion ist auf 100 MB begrenzt, und
 * Binärdaten gehören ohnehin nicht dorthin. Ob diese Dateien auf andere Geräte
 * wandern, konfiguriert der Nutzer in haex-vault; die Extension kennt nur lokale
 * Pfade.
 */
export function useAssetStore() {
  const haexVault = useHaexVaultStore();

  let rootPromise: Promise<string> | null = null;

  async function resolveRootAsync(): Promise<string> {
    const fs = haexVault.client.filesystem;
    const paths = (await fs.knownPaths()) as Record<string, string>;
    const base = paths.documents ?? paths.home;
    if (!base) throw new Error("[haex-notes] No writable base directory available");
    const root = `${base}/${ASSET_DIR}`;
    await fs.mkdir(root);
    return root;
  }

  const rootAsync = () => (rootPromise ??= resolveRootAsync());

  async function absolutePathAsync(asset: SelectAsset): Promise<string> {
    const root = await rootAsync();
    return `${root}/${assetRelPath(asset.sha256, extensionFor(asset.mimeType, asset.fileName))}`;
  }

  /**
   * Legt Bytes ab und gibt die Asset-Id zurück. Identischer Inhalt liefert das
   * bestehende Asset — der Dateiname ist der Inhalts-Hash, doppelte Importe
   * kosten also keinen zusätzlichen Platz.
   */
  async function putAsync(bytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
    const db = haexVault.orm;
    if (!db) throw new Error("[haex-notes] Database not ready");

    const sha256 = await sha256Hex(bytes);
    const [existing] = await db.select().from(assets).where(eq(assets.sha256, sha256));
    if (existing) return existing.id;

    const fs = haexVault.client.filesystem;
    const root = await rootAsync();
    const relPath = assetRelPath(sha256, extensionFor(mimeType, fileName));
    await fs.mkdir(`${root}/${relPath.split("/")[0]}`);
    await fs.writeFile(`${root}/${relPath}`, bytes);

    const id = crypto.randomUUID();
    await db.insert(assets).values({ id, sha256, fileName, mimeType, size: bytes.byteLength });
    return id;
  }

  async function metaAsync(assetId: string): Promise<SelectAsset | null> {
    const db = haexVault.orm;
    if (!db) return null;
    const [row] = await db.select().from(assets).where(eq(assets.id, assetId));
    return row ?? null;
  }

  /**
   * Liest die Bytes eines Assets — oder null, wenn die Datei nicht (mehr) da ist.
   *
   * Fehlende Dateien sind der Normalfall, nicht der Fehlerfall: der Ordner kann
   * verschoben worden sein, oder die Seite kam über einen Shared Space von einem
   * Gerät, auf dem die Datei liegt. Aufrufer zeichnen dann einen Platzhalter.
   */
  async function readAsync(assetId: string): Promise<Uint8Array | null> {
    const asset = await metaAsync(assetId);
    if (!asset) return null;
    const fs = haexVault.client.filesystem;
    const path = await absolutePathAsync(asset);
    if (!(await fs.exists(path).catch(() => false))) return null;
    return fs.readFile(path).catch(() => null);
  }

  return { putAsync, readAsync, metaAsync, absolutePathAsync };
}
```

**Step 2: Typecheck**

Run: `pnpm exec vue-tsc --noEmit -p .`
Expected: keine Fehler.

**Step 3: Commit**

```bash
git add app/composables/useAssetStore.ts
git commit -m "feat(haex-notes): add filesystem-backed asset store"
```

---

## Task 15: Sharing an das neue Modell anpassen

Zwei Dinge: der Import-als-Kopie muss die neuen Spalten mitkopieren, und beim Teilen einer Seite müssen ihre Asset-Zeilen in denselben Space.

**Files:**
- Create: `apps/haex-notes/app/lib/collectAssets.ts`
- Test: `apps/haex-notes/app/lib/collectAssets.test.ts`
- Modify: `apps/haex-notes/app/utils/importPages.ts`
- Modify: `apps/haex-notes/app/stores/spaces.ts`

**Step 1: Failing Test für die Asset-Sammlung**

Create `app/lib/collectAssets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ImageElement, PageBackground, PageLayer } from "~/types/document";
import { collectAssetIds } from "./collectAssets";

const image = (assetId: string): ImageElement => ({
  id: `img-${assetId}`,
  type: "image",
  x: 0, y: 0, width: 10, height: 10, rotation: 0,
  source: { kind: "asset", assetId },
  opacity: 1,
  bbox: [0, 0, 10, 10],
});

const layer = (...elements: ImageElement[]): PageLayer => ({
  id: "l1", name: "Ebene 1", visible: true, locked: false, elements,
});

const plainBackground: PageBackground = { paperColor: "#ffffff", template: "lined" };

describe("collectAssetIds", () => {
  it("returns nothing for a page without assets", () => {
    expect(collectAssetIds([layer()], plainBackground)).toEqual([]);
  });

  it("collects image element assets", () => {
    expect(collectAssetIds([layer(image("a"), image("b"))], plainBackground)).toEqual(["a", "b"]);
  });

  it("collects the pdf background asset", () => {
    const background: PageBackground = {
      ...plainBackground,
      overlay: { type: "pdf", assetId: "doc", pageIndex: 0 },
    };
    expect(collectAssetIds([layer()], background)).toEqual(["doc"]);
  });

  it("ignores inline image sources", () => {
    const background: PageBackground = {
      ...plainBackground,
      overlay: { type: "image", source: { kind: "inline", dataUrl: "data:," }, opacity: 0.3 },
    };
    expect(collectAssetIds([layer()], background)).toEqual([]);
  });

  it("deduplicates", () => {
    expect(collectAssetIds([layer(image("a"), image("a"))], plainBackground)).toEqual(["a"]);
  });
});
```

**Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./collectAssets"`

**Step 3: Implementierung schreiben**

Create `app/lib/collectAssets.ts`:

```ts
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
```

**Step 4: Test laufen lassen**

Run: `pnpm test`
Expected: `48 passed`

**Step 5: `buildPageCopies` erweitern**

Modify `app/utils/importPages.ts`. Die neuen Spalten müssen mitkopiert werden, sonst importiert der Empfänger eine leere Seite:

```ts
  return sourcePages.map((p, i) => ({
    id: crypto.randomUUID(),
    notebookId: targetNotebookId,
    pageNumber: startPageNumber + i,
    template: p.template,
    strokes: structuredClone(p.strokes),
    tables: structuredClone(p.tables),
    layers: p.layers ? structuredClone(p.layers) : null,
    background: p.background ? structuredClone(p.background) : null,
    width: p.width,
    height: p.height,
    backgroundImage: p.backgroundImage,
    thumbnail: p.thumbnail,
    orientation: p.orientation,
    deletedAt: null,
  }));
```

Die Legacy-Spalten werden weiter mitkopiert: eine Quellseite kann von einem Gerät mit älterer Extension-Version stammen und dann nur dort Inhalt haben.

Den Doc-Kommentar über der Funktion entsprechend anpassen.

**Step 6: Asset-Zeilen mitteilen**

Modify `app/stores/spaces.ts`.

Tabellennamen und Import ergänzen:

```ts
import { assets, notebooks, pages } from "~/database/schemas";
import { collectAssetIds } from "~/lib/collectAssets";
import { migratePageRow } from "~/lib/migratePage";

const FULL_ASSETS_TABLE = getTableName(manifest.publicKey, packageJson.name, "assets");
export { FULL_NOTEBOOKS_TABLE, FULL_PAGES_TABLE, FULL_ASSETS_TABLE };
```

Hilfsfunktion innerhalb des Stores ergänzen:

```ts
  /** Assignments für alle Assets, auf die die übergebenen Seiten verweisen. */
  function assetAssignmentsFor(
    sourcePages: { layers?: unknown; background?: unknown; strokes?: unknown }[],
    spaceId: string,
    groupId: string,
  ): SpaceAssignment[] {
    const ids = new Set<string>();
    for (const page of sourcePages) {
      const { layers, background } = migratePageRow(page as never);
      for (const id of collectAssetIds(layers, background)) ids.add(id);
    }
    return [...ids].map((id) => ({
      tableName: FULL_ASSETS_TABLE,
      rowPks: nbPk(id),
      spaceId,
      groupId,
    }));
  }
```

In `shareNotebookWithSpaceAsync` und `sharePagesWithSpaceAsync` die Assignment-Liste erweitern. Für `shareNotebookWithSpaceAsync`:

```ts
    const assignments: SpaceAssignment[] = [
      { tableName: FULL_NOTEBOOKS_TABLE, rowPks: nbPk(notebookId), spaceId, groupId: notebookId, type: "Notebook", label: nb?.name },
      ...nbPages.map((p) => ({ tableName: FULL_PAGES_TABLE, rowPks: nbPk(p.id), spaceId, groupId: notebookId })),
      ...assetAssignmentsFor(nbPages, spaceId, notebookId),
    ];
```

Für `sharePagesWithSpaceAsync` analog, dort müssen die Seitenzeilen vorher geladen werden:

```ts
    const sharedPages = await orm.select().from(pages).where(inArray(pages.id, pageIds));
```

und `...assetAssignmentsFor(sharedPages, spaceId, notebookId)` anhängen.

Beim Aufheben der Freigabe werden die Asset-Zeilen bewusst **nicht** mit entfernt: dasselbe Asset kann von einer anderen, weiterhin geteilten Seite referenziert werden. Ein Aufräumen verwaister Asset-Assignments gehört in eine spätere Phase — als Kommentar im Code vermerken.

**Step 7: Typecheck, Lint, Tests**

```bash
pnpm exec vue-tsc --noEmit -p .
pnpm exec eslint app --max-warnings 0
pnpm test
```
Expected: alles grün, `48 passed`.

**Step 8: Commit**

```bash
git add app/lib/collectAssets.ts app/lib/collectAssets.test.ts app/utils/importPages.ts app/stores/spaces.ts
git commit -m "feat(haex-notes): carry layers and asset rows through sharing"
```

---

## Task 16: Design-Dokument nachziehen

**Files:**
- Modify: `docs/plans/2026-07-28-haex-notes-xournalpp-features.md`

**Step 1: PageBackground korrigieren**

Im Abschnitt „Element- und Layer-Modell" den `PageBackground`-Union durch die tatsächlich implementierte Komposition ersetzen und in einem Satz begründen, dass Vorlage und Overlay sich nicht ausschließen.

**Step 2: Kommando-Set korrigieren**

Der Abschnitt „Command-basiertes Undo" listet zehn Kommandos, darunter `TransformElements`, `SetElementProps` und `InsertVerticalSpace`. Umgesetzt sind sie als drei Aufrufe desselben `mutateElements`-Primitivs. Die Liste entsprechend kürzen und `composite` ergänzen.

**Step 3: Commit**

```bash
git add docs/plans/2026-07-28-haex-notes-xournalpp-features.md
git commit -m "docs(haex-notes): align design with the implemented model"
```

---

## Task 17: Abnahme

Kein Code. Diese Liste muss vollständig durchlaufen sein, bevor Phase 1 als fertig gilt.

**Automatisiert:**

```bash
pnpm test
pnpm exec vue-tsc --noEmit -p .
pnpm exec eslint app --max-warnings 0
pnpm build
```

Alle vier ohne Fehler.

**Manuell im laufenden haex-vault**, mit dem in den Vorbedingungen angelegten Test-Notizbuch:

| # | Prüfung | Erwartet |
|---|---|---|
| 1 | Bestandsnotizbuch öffnen | Alle Striche, Tabellen und das Hintergrundbild wie vor dem Umbau |
| 2 | Querformat-Seite öffnen | Korrekte Seitenmaße |
| 3 | Neuen Strich zeichnen, Strg+Z | Strich verschwindet |
| 4 | Strg+Y | Strich kommt zurück |
| 5 | **Tabellenzeile hinzufügen, Strg+Z** | Zeile verschwindet — das ging vor Phase 1 nicht |
| 6 | Tabellenlinie ziehen, loslassen, Strg+Z | Die **ganze** Ziehbewegung wird in einem Schritt zurückgenommen, nicht Pixel für Pixel |
| 7 | Seite wechseln, zurückwechseln | Inhalte unverändert, Undo-Stack seitenübergreifend intakt |
| 8 | Speichern, Extension neu laden | Inhalte unverändert |
| 9 | Zeiger stillhalten, Performance-Panel aufzeichnen | Keine wiederkehrende Frame-Aktivität |
| 10 | Seite löschen, Papierkorb-Vorschau öffnen | Inhalt sichtbar |
| 11 | Seite wiederherstellen | Landet im Notizbuch und wird angezeigt |
| 12 | Seite in einen Space teilen, auf einem zweiten Gerät importieren | Import zeigt denselben Inhalt |
| 13 | Vorlage einer Seite wechseln | Lineatur ändert sich, Striche bleiben |

**Wichtig zu Prüfung 8:** Nach dem ersten Speichern schreibt haex-notes nur noch `layers`. Eine ältere Version der Extension zeigt diese Seite dann leer an. Das ist die im Design-Dokument bewusst getroffene Entscheidung — aber vor dem Release als Änderungshinweis vermerken.

**Schlusseintrag:** Nach bestandener Abnahme `.claude/session-log.md` um einen Eintrag ergänzen und `graphify update .` laufen lassen.
