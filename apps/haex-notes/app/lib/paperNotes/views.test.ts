import { describe, expect, it } from "vitest";
import type { PageLayer, PaperNoteImport } from "~/types/document";
import { clonePlain } from "../clone";
import type { PageDoc } from "../commands";
import { createUndoStack } from "../undoStack";
import { originalLayerId, setPaperView, viewOf } from "./views";

const paperImport = {
  version: 1, originalAssetId: "photo", rotation: 0, sourceMimeType: "image/jpeg", sourceWidth: 3000, sourceHeight: 4000,
  processing: { state: "ready" }, regions: [], createdAt: "2026-10-21T10:00:00.000Z", updatedAt: "2026-10-21T10:00:00.000Z",
} as PaperNoteImport;

const layer = (id: string, elements: PageLayer["elements"] = []): PageLayer => ({ id, name: id, visible: true, locked: false, elements });

const page = (): PageDoc => ({
  id: "p1",
  layers: [
    { ...layer("original", [{
      id: "o", type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0,
      source: { kind: "asset", assetId: "photo" }, opacity: 1, bbox: [0, 0, 10, 10],
    }]), locked: true },
    layer("text"),
    layer("own"),
  ],
  background: { paperColor: "#ffffff", template: "blank" },
  width: 794,
  height: 1123,
  paperImport,
});

const visible = (doc: PageDoc) => doc.layers.map((l) => l.visible);

describe("paper views", () => {
  it("find the layer with the original photo", () => {
    expect(originalLayerId(page().layers, paperImport)).toBe("original");
  });

  it("show only the original, only the draft or both, and undo to the previous view", () => {
    const doc = page();
    const before = clonePlain(doc);
    const stack = createUndoStack();

    stack.push(setPaperView(doc, "original")!);
    expect(visible(doc)).toEqual([true, false, false]);
    expect(viewOf(doc.layers, "original")).toBe("original");

    stack.push(setPaperView(doc, "draft")!);
    expect(visible(doc)).toEqual([false, true, true]);
    expect(viewOf(doc.layers, "original")).toBe("draft");

    stack.push(setPaperView(doc, "compare")!);
    expect(viewOf(doc.layers, "original")).toBe("compare");
    expect(doc.layers.map((l) => l.elements)).toEqual(before.layers.map((l) => l.elements));

    stack.undo();
    expect(viewOf(doc.layers, "original")).toBe("draft");
    while (stack.undo());
    expect(doc).toEqual(before);
  });

  it("do nothing when the view already holds or the page is no photo page", () => {
    expect(setPaperView(page(), "compare")).toBeNull();
    const { paperImport: _none, ...plain } = page();
    expect(setPaperView(plain, "draft")).toBeNull();
  });
});
