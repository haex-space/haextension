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
