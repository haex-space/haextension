import { describe, expect, it } from "vitest";
import { isPdf, renderScale } from "./pdf";

describe("isPdf", () => {
  it("knows a PDF by its type, and by its name when the type is missing", () => {
    expect(isPdf({ mimeType: "application/pdf", name: "blatt" })).toBe(true);
    expect(isPdf({ mimeType: "application/octet-stream", name: "Übungsblatt.PDF" })).toBe(true);
  });

  it("leaves other files alone", () => {
    expect(isPdf({ mimeType: "image/png", name: "foto.png" })).toBe(false);
    expect(isPdf({ mimeType: "application/zip", name: "pdf.zip" })).toBe(false);
  });
});

describe("renderScale", () => {
  it("rasterises an A4 page of 595 points at about 1800 px wide", () => {
    expect(595 * renderScale(595)).toBeCloseTo(1800, 0);
  });

  it("stays within limits for a tiny or a huge page and a page of no width", () => {
    expect(renderScale(10)).toBe(4);
    expect(renderScale(100000)).toBe(0.5);
    expect(renderScale(0)).toBe(1);
    expect(renderScale(Number.NaN)).toBe(1);
  });
});
