import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { PageLayer } from "~/types/document";
import { buildPdfAsync, defaultPdfSettings, exportLayers, MAX_MARGIN_MM, placePage, RASTER_SCALE, type PdfSettings } from "./exportPdf";

/** A 1x1 baseline JPEG, enough for pdf-lib to embed. */
const JPEG = Uint8Array.from(atob(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
), (c) => c.charCodeAt(0));

const portrait = { width: 794, height: 1123 };
const settings = (patch: Partial<PdfSettings> = {}): PdfSettings => ({ ...defaultPdfSettings(), ...patch });

describe("placePage", () => {
  it("by default makes the PDF page as large as the note page, without margin", () => {
    expect(defaultPdfSettings()).toEqual({ paper: "auto", orientation: "auto", marginMm: 0, quality: "high" });
    const placed = placePage(portrait, settings());
    expect(placed.width).toBeCloseTo(595.5);
    expect(placed.height).toBeCloseTo(842.25);
    expect(placed).toMatchObject({ x: 0, y: 0 });
    expect(placed.drawWidth).toBeCloseTo(placed.width);
  });

  it("puts the page on A4 or Letter with margins, centred and in proportion", () => {
    const placed = placePage(portrait, settings({ paper: "letter", marginMm: 10 }));
    expect([placed.width, placed.height]).toEqual([612, 792]);
    const margin = 10 * (72 / 25.4);
    expect(placed.drawWidth / placed.drawHeight).toBeCloseTo(portrait.width / portrait.height);
    // A4 is slimmer than Letter, so the height limits it and it is centred across.
    expect(placed.drawHeight).toBeCloseTo(792 - 2 * margin);
    expect(placed.y).toBeCloseTo(margin);
    expect(placed.x).toBeCloseTo((612 - placed.drawWidth) / 2);
  });

  it("keeps the margin between none and the maximum", () => {
    const largest = placePage(portrait, settings({ paper: "a4", marginMm: MAX_MARGIN_MM }));
    expect(placePage(portrait, settings({ paper: "a4", marginMm: 1000 }))).toEqual(largest);
    expect(largest.drawWidth).toBeGreaterThan(0);
    expect(placePage(portrait, settings({ paper: "a4", marginMm: Number.NaN }))).toEqual(placePage(portrait, settings({ paper: "a4" })));
  });

  it("follows the page or the chosen orientation", () => {
    expect(placePage({ width: 1123, height: 794 }, settings({ paper: "a4" })).width).toBeCloseTo(841.89);
    const turned = placePage(portrait, settings({ paper: "a4", orientation: "landscape" }));
    expect(turned.width).toBeGreaterThan(turned.height);
    expect(turned.drawHeight).toBeCloseTo(turned.height);
  });

  it("raster finer with higher quality", () => {
    expect(RASTER_SCALE.high).toBeGreaterThan(RASTER_SCALE.medium);
    expect(RASTER_SCALE.medium).toBeGreaterThan(RASTER_SCALE.low);
  });
});

describe("exportLayers", () => {
  const layer = (id: string, visible: boolean): PageLayer => ({ id, name: id, visible, locked: false, elements: [] });

  it("keeps the visible layers; attachments are no layers and never reach the PDF", () => {
    const layers = [layer("photo", true), layer("text", true), layer("hidden", false)];
    expect(exportLayers(layers).map((l) => l.id)).toEqual(["photo", "text"]);
  });
});

describe("buildPdfAsync", () => {
  it("makes one PDF page per note page, each with its own size", async () => {
    const bytes = await buildPdfAsync([
      { size: portrait, jpeg: JPEG },
      { size: { width: 1123, height: 794 }, jpeg: JPEG },
    ], settings());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    const [first, second] = pdf.getPages();
    expect(first!.getWidth()).toBeCloseTo(595.5);
    expect(second!.getWidth()).toBeGreaterThan(second!.getHeight());
  });

  it("changes the PDF with the paper size", async () => {
    const pdf = await PDFDocument.load(await buildPdfAsync([{ size: portrait, jpeg: JPEG }], settings({ paper: "letter" })));
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});
