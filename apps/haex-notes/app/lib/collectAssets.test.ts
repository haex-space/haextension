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
