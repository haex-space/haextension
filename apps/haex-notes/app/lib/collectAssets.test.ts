import { describe, expect, it } from "vitest";
import type { ImageElement, PageBackground, PageLayer, PaperNoteImport } from "~/types/document";
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
  it("collects the assets of the attachments, also those of files the student attached", () => {
    const attachments = [
      { id: "a1", kind: "original" as const, assetId: "photo", name: "seite.jpg", mimeType: "image/jpeg", addedAt: "t" },
      { id: "a2", kind: "file" as const, assetId: "worksheet", name: "blatt.pdf", mimeType: "application/pdf", addedAt: "t" },
    ];
    expect(collectAssetIds([layer()], plainBackground, undefined, attachments)).toEqual(["photo", "worksheet"]);
  });

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

  it("collects the original and the working copy of a photo import", () => {
    const paperImport = {
      version: 1, originalAssetId: "original", workingAssetId: "working",
    } as PaperNoteImport;
    expect(collectAssetIds([layer(image("crop"))], plainBackground, paperImport))
      .toEqual(["crop", "original", "working"]);
  });

  it("collects the close-up photos of a photo import", () => {
    const paperImport = {
      version: 1, originalAssetId: "original", closeUps: [{ id: "c1", assetId: "close-up" }],
    } as PaperNoteImport;
    expect(collectAssetIds([layer()], plainBackground, paperImport)).toEqual(["original", "close-up"]);
  });

  it("deduplicates", () => {
    expect(collectAssetIds([layer(image("a"), image("a"))], plainBackground)).toEqual(["a"]);
  });
});
