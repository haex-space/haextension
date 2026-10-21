import { describe, expect, it } from "vitest";
import type { PaperNoteImport } from "~/types/document";
import { LEGACY_BACKGROUND_OPACITY, migratePageRow, serializePageDoc, type LegacyPageRow } from "./migratePage";

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

const paperImport: PaperNoteImport = {
  version: 1,
  originalAssetId: "original",
  workingAssetId: "working",
  rotation: 90,
  sourceMimeType: "image/jpeg",
  sourceWidth: 3000,
  sourceHeight: 4000,
  processing: { state: "ready", model: "qwen3-vl:4b-instruct", place: "this_device" },
  regions: [{ id: "r1", kind: "text", sourceBox: [10, 20, 500, 80], elementIds: ["e1"] }],
  createdAt: "2026-10-21T10:00:00.000Z",
  updatedAt: "2026-10-21T10:00:30.000Z",
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

  it("falls back to the legacy columns when the stored layers are malformed", () => {
    const malformed = [
      { not: "an array" },
      [{ id: "l1", visible: true, elements: [{ points: [] }] }],
      [{ id: "l1", visible: true, elements: [{ id: "s9", type: "stroke" }] }],
    ];
    for (const layers of malformed) {
      const { layers: migrated } = migratePageRow({ ...legacyRow, layers });
      expect(migrated[0]!.elements.map((e) => e.id)).toEqual(["s1", "s2", "t1"]);
    }
  });

  it("keeps element types it does not know yet", () => {
    const future = { id: "x1", type: "hologram", bbox: [0, 0, 1, 1] };
    const layers = [{ id: "l1", name: "Ebene 1", visible: true, locked: false, elements: [future] }];
    expect(migratePageRow({ ...legacyRow, layers }).layers[0]!.elements).toEqual([future]);
  });

  it("falls back to the legacy background when the stored one is malformed", () => {
    const { background } = migratePageRow({ ...legacyRow, background: { template: 5 } });
    expect(background).toEqual({ paperColor: "#ffffff", template: "grid" });
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

describe("migratePageRow with a photo import", () => {
  const layers = [{
    id: "l1", name: "Ebene 1", visible: true, locked: false,
    elements: [{
      id: "t1", type: "table", x: 0, y: 0, columns: 2, rows: 1, columnWidths: [80, 80], rowHeights: [30],
      cells: [["Tag", ""]], bbox: [0, 0, 160, 30],
    }],
  }];

  it("keeps the cells of a stored table", () => {
    const { layers: migrated } = migratePageRow({ layers });
    expect(migrated[0]!.elements[0]).toMatchObject({ cells: [["Tag", ""]] });
  });

  it("has no paper import for an ordinary page", () => {
    expect(migratePageRow(legacyRow).paperImport).toBeUndefined();
  });

  it("keeps a stored paper import, also of a later version", () => {
    expect(migratePageRow({ layers, paperImport }).paperImport).toEqual(paperImport);
    const later = { ...paperImport, version: 7, unknown: true };
    expect(migratePageRow({ layers, paperImport: later }).paperImport).toEqual(later);
  });

  it("ignores a malformed paper import", () => {
    expect(migratePageRow({ layers, paperImport: { version: "1" } }).paperImport).toBeUndefined();
    expect(migratePageRow({ layers, paperImport: "x" }).paperImport).toBeUndefined();
    const { workingAssetId: _omitted, ...withoutWorkingCopy } = paperImport;
    expect(migratePageRow({ layers, paperImport: withoutWorkingCopy }).paperImport).toBeUndefined();
  });
});

describe("serializePageDoc", () => {
  const row: LegacyPageRow = { ...legacyRow, backgroundImage: "data:image/png;base64,AAA", orientation: "landscape" };
  const doc = { id: "p1", ...migratePageRow(row) };

  it("writes the legacy columns back in their old shape", () => {
    const serialized = serializePageDoc(doc);
    expect(serialized).toMatchObject({
      strokes: row.strokes,
      tables: row.tables,
      template: "grid",
      backgroundImage: "data:image/png;base64,AAA",
      orientation: "landscape",
    });
  });

  it("round-trips through migratePageRow", () => {
    const { layers, background, width, height } = serializePageDoc(doc);
    expect(migratePageRow({ layers, background, width, height })).toEqual(migratePageRow(row));
  });

  it("returns copies detached from the document", () => {
    expect(serializePageDoc(doc).layers).not.toBe(doc.layers);
  });

  it("writes the paper import, and null for an ordinary page", () => {
    expect(serializePageDoc(doc).paperImport).toBeNull();
    const imported = serializePageDoc({ ...doc, paperImport });
    expect(imported.paperImport).toEqual(paperImport);
    expect(imported.paperImport).not.toBe(paperImport);
    const { layers, background, width, height } = imported;
    expect(migratePageRow({ layers, background, width, height, paperImport: imported.paperImport }).paperImport)
      .toEqual(paperImport);
  });
});
