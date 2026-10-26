import type { ModelJob } from "@haex-space/vault-sdk";
import { describe, expect, it } from "vitest";
import type { PageLayer, PaperNoteImport, StrokeElement, TextElement } from "~/types/document";
import { computeBbox } from "../bbox";
import { clonePlain } from "../clone";
import type { PageDoc } from "../commands";
import { createUndoStack } from "../undoStack";
import { readCloseUpAsync } from "./closeUp";
import type { Copy, ImportDeps, Photo } from "./importPage";
import type { PageJobOutcome, Rotation } from "./mapResult";

const photo: Photo = {
  bytes: new Uint8Array([7]), mimeType: "image/jpeg", fileName: "stelle.jpg", width: 1000, height: 500, rotation: 0,
};
/** The rectangle the student drew: 400 × 200 at (100, 300). */
const box = { x: 100, y: 300, width: 400, height: 200 };

const text = (id: string, x: number, y: number, width = 100): TextElement => {
  const element: TextElement = {
    id, type: "text", x, y, width, height: 30, rotation: 0, text: id, fontFamily: "Caveat", fontSize: 20,
    color: "#1f2937", bbox: [0, 0, 0, 0],
  };
  element.bbox = computeBbox(element);
  return element;
};
const stroke: StrokeElement = {
  id: "own", type: "stroke", points: [[150, 350, 0.5], [160, 360, 0.5]], color: "#000", size: 2, tool: "brush",
  bbox: [149, 349, 12, 12],
};
const layer = (id: string, name: string, elements: PageLayer["elements"], locked = false): PageLayer => ({
  id, name, visible: true, locked, elements,
});

/** A photo page, whose original hangs on it as an attachment and not as a layer: "inside" lies in the rectangle, "across" sticks out of it, "outside" is elsewhere. */
const page = (): PageDoc => ({
  id: "p1",
  layers: [
    layer("l-text", "Text", [text("inside", 150, 320), text("across", 450, 320), text("outside", 100, 700)]),
    layer("l-objects", "Objekte", []),
    layer("l-own", "Eigene Ergänzungen", [stroke]),
  ],
  background: { paperColor: "#ffffff", template: "blank" },
  width: 794,
  height: 1123,
  paperImport: {
    version: 1, originalAssetId: "photo", workingAssetId: "working", rotation: 0, sourceMimeType: "image/jpeg",
    sourceWidth: 3000, sourceHeight: 4000, processing: { state: "ready", model: "m", place: "this_device" },
    regions: ["inside", "across", "outside"].map((id) => ({ id: `r-${id}`, kind: "text", sourceBox: [0, 0, 10, 10], elementIds: [id] })),
    createdAt: "t0", updatedAt: "t0",
  } as PaperNoteImport,
});

const read: PageJobOutcome = {
  kind: "completed",
  regions: [
    { kind: "text", box: [0, 0, 1000, 400], text: "Säurelösungen" },
    { kind: "image", box: [0, 500, 500, 1000] },
  ],
  rotation: 0,
  texts: ["Säurelösungen sind ätzend"],
  model: "qwen3-vl:4b-instruct",
  place: "network",
};

function fakes(outcomes: PageJobOutcome[], options: { failCrop?: boolean } = {}) {
  const assets: string[] = [];
  const copies: Rotation[] = [];
  const jobs: ModelJob[] = [];
  let id = 0;
  const deps: ImportDeps = {
    putAsset: async (_bytes, _mimeType, name) => {
      assets.push(name);
      return `asset-${name}`;
    },
    makeWorkingCopy: async (rotation): Promise<Copy> => {
      copies.push(rotation);
      return {
        bytes: new Uint8Array([1]), width: 1000, height: 500,
        crop: async () => {
          if (options.failCrop) throw new Error("crop failed");
          return new Uint8Array([2]);
        },
      };
    },
    runJob: async (job) => {
      jobs.push(job);
      return outcomes.shift() ?? { kind: "cancelled" };
    },
    newId: () => `id-${++id}`,
    now: () => "t1",
  };
  return { deps, assets, copies, jobs };
}

/** Reads the close-up and takes the result over. */
async function commandOf(doc: PageDoc, deps: ImportDeps, from = photo) {
  const result = await readCloseUpAsync(from, box, doc, "Caveat", deps);
  if (result.kind !== "read") throw new Error(result.kind);
  return { result, command: await result.commitAsync() };
}

const ids = (doc: PageDoc, layerId: string) => doc.layers.find((l) => l.id === layerId)!.elements.map((e) => e.id);

describe("readCloseUpAsync", () => {
  it("fits the regions of the close-up into the rectangle", async () => {
    const doc = page();
    const { deps } = fakes([read]);
    const { result, command } = await commandOf(doc, deps);
    command.apply();

    const added = doc.layers.flatMap((l) => l.elements).filter((e) => e.id.startsWith("id-"));
    expect(added.map((e) => e.type).sort()).toEqual(["image", "text"]);
    for (const element of added) {
      const [x, y, width] = element.bbox;
      expect(x).toBeGreaterThanOrEqual(box.x);
      expect(y).toBeGreaterThanOrEqual(box.y);
      expect(x + width).toBeLessThanOrEqual(box.x + box.width + 0.001);
    }
    expect((added.find((e) => e.type === "text") as TextElement).text).toBe("Säurelösungen sind ätzend");
    expect(result).toMatchObject({ model: "qwen3-vl:4b-instruct", place: "network" });
  });

  it("replaces only generated elements fully inside the rectangle", async () => {
    const doc = page();
    const before = clonePlain(doc);
    const { deps } = fakes([read]);
    (await commandOf(doc, deps)).command.apply();

    expect(ids(doc, "l-text")).toEqual(expect.arrayContaining(["across", "outside"]));
    expect(ids(doc, "l-text")).not.toContain("inside");
    // A page whose original hangs on it as an attachment reads a close-up like any other.
    expect(doc.layers.map((l) => l.name)).toEqual(before.layers.map((l) => l.name));
    expect(ids(doc, "l-own")).toEqual(["own"]);
  });

  it("records the close-up and its regions and drops the replaced ones", async () => {
    const doc = page();
    const { deps, assets } = fakes([read]);
    (await commandOf(doc, deps)).command.apply();

    const { closeUps, regions, processing, updatedAt } = doc.paperImport!;
    expect(closeUps).toEqual([{
      id: expect.any(String), assetId: "asset-stelle.jpg", rotation: 0, pageBox: [100, 300, 400, 200],
      model: "qwen3-vl:4b-instruct", place: "network", createdAt: "t1",
    }]);
    expect(regions.map((r) => r.id)).toEqual(expect.arrayContaining(["r-across", "r-outside"]));
    expect(regions.map((r) => r.id)).not.toContain("r-inside");
    expect(regions.filter((r) => r.closeUpId === closeUps![0]!.id)).toHaveLength(2);
    expect(processing).toEqual(page().paperImport!.processing);
    expect(updatedAt).toBe("t1");
    expect(assets).toContain("stelle.jpg");
  });

  it("undoes elements and origin in one step, and redoes them", async () => {
    const doc = page();
    const before = clonePlain(doc);
    const { deps } = fakes([read]);
    const stack = createUndoStack();
    stack.push((await commandOf(doc, deps)).command);
    const after = clonePlain(doc);
    stack.undo();
    expect(doc).toEqual(before);
    stack.redo();
    expect(doc).toEqual(after);
  });

  it("stores nothing until the result is taken over, and then reads the page as it is", async () => {
    const doc = page();
    const { deps, assets } = fakes([read]);
    const result = await readCloseUpAsync(photo, box, doc, "Caveat", deps);
    if (result.kind !== "read") throw new Error(result.kind);
    expect(assets).toEqual([]);

    // While reading, the student deleted "inside" and its region went with it.
    doc.layers[1]!.elements = doc.layers[1]!.elements.filter((e) => e.id !== "inside");
    doc.paperImport = { ...doc.paperImport!, regions: doc.paperImport!.regions.filter((r) => r.id !== "r-inside") };
    (await result.commitAsync()).apply();

    expect(assets.sort()).toEqual([expect.stringMatching(/^crop-/), "stelle.jpg"]);
    expect(doc.paperImport!.regions.map((r) => r.id)).toEqual(expect.arrayContaining(["r-across", "r-outside"]));
    expect(doc.paperImport!.regions.filter((r) => !r.closeUpId)).toHaveLength(2);
  });

  it("reports an empty result as unusable instead of clearing the area", async () => {
    const { deps } = fakes([{ ...read, regions: [{ kind: "text", box: [0, 0, 100, 100], text: " " }], texts: [] }]);
    expect(await readCloseUpAsync(photo, box, page(), "Caveat", deps)).toEqual({ kind: "failed", error: "unusable" });
  });

  it("follows a rotation hint once", async () => {
    const doc = page();
    const { deps, copies, jobs } = fakes([{ ...read, rotation: 90 }, { ...read, rotation: 90 }]);
    (await commandOf(doc, deps, { ...photo, rotation: 270 })).command.apply();
    expect(copies).toEqual([270, 0]);
    expect(jobs).toHaveLength(2);
    expect(doc.paperImport!.closeUps![0]!.rotation).toBe(0);
  });

  it("changes nothing and stores nothing on an error, a cancel or a failed crop", async () => {
    for (const [outcomes, options, expected] of [
      [[{ kind: "failed", error: "consent_denied" }], {}, { kind: "failed", error: "consent_denied" }],
      [[{ kind: "cancelled" }], {}, { kind: "cancelled" }],
      [[read], { failCrop: true }, { kind: "failed", error: "processing_failed" }],
    ] as const) {
      const doc = page();
      const { deps, assets } = fakes([...outcomes] as PageJobOutcome[], options);
      expect(await readCloseUpAsync(photo, box, doc, "Caveat", deps)).toEqual(expected);
      expect(assets).toEqual([]);
      expect(doc).toEqual(page());
    }
  });
});
