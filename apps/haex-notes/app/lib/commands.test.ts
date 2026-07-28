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
