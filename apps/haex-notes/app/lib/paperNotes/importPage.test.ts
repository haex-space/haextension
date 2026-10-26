import type { ModelJob } from "@haex-space/vault-sdk";
import { describe, expect, it } from "vitest";
import type { ImageElement } from "~/types/document";
import { importPhotoAsync, LAYER_NAMES, type Copy, type ImportDeps, type Photo } from "./importPage";
import type { PageJobOutcome, Rotation } from "./mapResult";

const photo: Photo = {
  bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg", fileName: "seite.jpg", width: 3000, height: 4000, rotation: 0,
};
const page = { width: 794, height: 1123 };

const read: PageJobOutcome = {
  kind: "completed",
  regions: [
    { kind: "text", box: [100, 100, 600, 150], text: "Säurelösungen" },
    { kind: "table", box: [100, 200, 900, 400], rows: [["Tag", "Fach"]] },
    { kind: "image", box: [100, 450, 500, 700] },
  ],
  rotation: 0,
  texts: ["Säurelösungen"],
  model: "qwen3-vl:4b-instruct",
  place: "this_device",
};

/** Fake dependencies: assets get ids by name, each job answers the next outcome. */
function fakes(outcomes: PageJobOutcome[]) {
  const assets: { name: string; mimeType: string; bytes: Uint8Array }[] = [];
  const copies: Rotation[] = [];
  const jobs: ModelJob[] = [];
  let id = 0;
  const deps: ImportDeps = {
    putAsset: async (bytes, mimeType, name) => {
      assets.push({ name, mimeType, bytes });
      return `asset-${name}`;
    },
    makeWorkingCopy: async (rotation): Promise<Copy> => {
      copies.push(rotation);
      const turned = rotation === 90 || rotation === 270;
      return {
        bytes: new Uint8Array([rotation / 90]),
        width: turned ? 1536 : 2048,
        height: turned ? 2048 : 1536,
        crop: async () => new Uint8Array([9]),
      };
    },
    runJob: async (job) => {
      jobs.push(job);
      return outcomes.shift() ?? { kind: "cancelled" };
    },
    newId: () => `id-${++id}`,
    now: () => "2026-10-21T10:00:00.000Z",
  } as ImportDeps;
  return { deps, assets, copies, jobs };
}

describe("importPhotoAsync", () => {
  it("stores the original and the working copy and reads the copy once", async () => {
    const { deps, assets, jobs } = fakes([read]);
    const result = await importPhotoAsync(photo, page, "Caveat", deps);

    expect(assets.map((a) => a.name).slice(0, 2)).toEqual(["seite.jpg", "working-seite.jpg.jpg"]);
    expect(assets[0]!.bytes).toBe(photo.bytes);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.steps[0]!.input.images![0]!.data).toBe("AA==");
    expect(result.paperImport).toMatchObject({
      originalAssetId: "asset-seite.jpg", workingAssetId: "asset-working-seite.jpg.jpg", rotation: 0,
      sourceWidth: 3000, sourceHeight: 4000,
      processing: { state: "ready", model: "qwen3-vl:4b-instruct", place: "this_device" },
    });
  });

  it("shows only the draft on the page and hangs the original on it as an attachment", async () => {
    const { deps } = fakes([read]);
    const { layers, paperImport, attachments } = await importPhotoAsync(photo, page, "Caveat", deps);

    expect(layers.map((l) => [l.name, l.locked, l.elements.map((e) => e.type)])).toEqual([
      [LAYER_NAMES.text, false, ["text"]],
      [LAYER_NAMES.objects, false, ["table", "image"]],
      [LAYER_NAMES.own, false, []],
    ]);
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      kind: "original", assetId: paperImport.originalAssetId, name: "seite.jpg", mimeType: "image/jpeg", size: 3,
    });
    expect(paperImport.regions.map((r) => r.kind)).toEqual(["text", "table", "image"]);
    const crop = layers[1]!.elements[1] as ImageElement;
    expect(crop.source).toEqual({ kind: "asset", assetId: `asset-crop-${crop.id}.jpg` });
    expect(paperImport.regions[2]!.elementIds).toEqual([crop.id]);
  });

  it("turns the copy and reads once more after a rotation hint, but not twice", async () => {
    const { deps, copies, jobs } = fakes([{ ...read, rotation: 90 }, { ...read, rotation: 90 }]);
    const { paperImport, layers } = await importPhotoAsync({ ...photo, rotation: 270 }, page, "Caveat", deps);

    expect(copies).toEqual([270, 0]);
    expect(jobs).toHaveLength(2);
    expect(paperImport.rotation).toBe(0);
    expect(layers.map((l) => l.name)).not.toContain(LAYER_NAMES.photo);
  });

  it("keeps the attachment as taken, and shows a turned photo upright on a page without a draft", async () => {
    const { deps } = fakes([{ kind: "failed", error: "unusable" }]);
    const { layers, attachments } = await importPhotoAsync({ ...photo, rotation: 90 }, page, "Caveat", deps);
    expect(attachments[0]).toMatchObject({ kind: "original", size: 3 });
    const original = layers[0]!.elements[0] as ImageElement;
    expect(original.rotation).toBeCloseTo(Math.PI / 2);
    // Turned by a quarter, its long side runs across the page like the copy's short side.
    expect(original.height).toBeCloseTo(original.width * (4000 / 3000));
  });

  it("puts the photo on a layer of its own on a page without a draft, and attaches it as well", async () => {
    for (const outcome of [{ kind: "failed", error: "timeout" }, { kind: "cancelled" }] as const) {
      const { deps } = fakes([outcome]);
      const { layers, attachments, paperImport } = await importPhotoAsync(photo, page, "Caveat", deps);
      expect(layers.map((l) => [l.name, l.locked, l.elements.length])).toEqual([
        [LAYER_NAMES.photo, false, 1], [LAYER_NAMES.text, false, 0], [LAYER_NAMES.objects, false, 0], [LAYER_NAMES.own, false, 0],
      ]);
      expect(attachments.map((a) => a.assetId)).toEqual([paperImport.originalAssetId]);
    }
  });

  it("treats a reading without a usable region as a page without a draft", async () => {
    const { deps } = fakes([{ ...read, regions: [], texts: [] }]);
    const { layers } = await importPhotoAsync(photo, page, "Caveat", deps);
    expect(layers.map((l) => l.name)).toEqual([LAYER_NAMES.photo, LAYER_NAMES.text, LAYER_NAMES.objects, LAYER_NAMES.own]);
  });

  it("leaves a page with only the photo for each error and a cancel", async () => {
    for (const [outcome, state] of [
      [{ kind: "failed", error: "no_capable_model" }, "failed"],
      [{ kind: "failed", error: "consent_denied" }, "failed"],
      [{ kind: "failed", error: "unusable" }, "failed"],
      [{ kind: "failed", error: "timeout" }, "failed"],
      [{ kind: "failed", error: "unavailable" }, "failed"],
      [{ kind: "cancelled" }, "manual"],
    ] as const) {
      const { deps } = fakes([outcome]);
      const { layers, paperImport } = await importPhotoAsync(photo, page, "Caveat", deps);
      expect(layers.flatMap((l) => l.elements)).toHaveLength(1);
      expect(paperImport.processing.state).toBe(state);
      expect(paperImport.processing.error).toBe(outcome.kind === "failed" ? outcome.error : undefined);
      expect(paperImport.regions).toEqual([]);
    }
  });

  it("keeps the original when local processing fails before a working asset exists", async () => {
    const { deps } = fakes([read]);
    const failingDeps: ImportDeps = {
      ...deps,
      makeWorkingCopy: async () => { throw new Error("canvas failed"); },
    };

    const { layers, paperImport } = await importPhotoAsync(photo, page, "Caveat", failingDeps);

    expect(layers.flatMap((layer) => layer.elements)).toHaveLength(1);
    expect(paperImport.processing).toMatchObject({ state: "failed", error: "processing_failed" });
    expect(paperImport.workingAssetId).toBeUndefined();
  });

  it("keeps the original when creating a recognized image crop fails", async () => {
    const { deps } = fakes([read]);
    const makeWorkingCopy = deps.makeWorkingCopy;
    const failingDeps: ImportDeps = {
      ...deps,
      makeWorkingCopy: async (rotation) => ({
        ...(await makeWorkingCopy(rotation)),
        crop: async () => { throw new Error("crop failed"); },
      }),
    };

    const { layers, paperImport } = await importPhotoAsync(photo, page, "Caveat", failingDeps);

    expect(layers.flatMap((layer) => layer.elements)).toHaveLength(1);
    expect(paperImport.processing).toMatchObject({ state: "failed", error: "processing_failed" });
  });

  it("sets a formula line on the text layer and keeps a source that cannot be set as text", async () => {
    const formulas: PageJobOutcome = {
      ...read,
      regions: [
        { kind: "formula", box: [100, 100, 700, 160], latex: "\\ce{HCl + H2O -> H3O+ + Cl-}" },
        { kind: "formula", box: [100, 200, 700, 260], latex: "\\frac{1" },
      ],
      texts: [],
    };
    const { deps } = fakes([formulas]);
    const { layers, paperImport } = await importPhotoAsync(photo, page, "Caveat", deps);

    const text = layers.find((l) => l.name === LAYER_NAMES.text)!;
    expect(text.elements.map((e) => e.type)).toEqual(["latex", "text"]);
    expect(layers.find((l) => l.name === LAYER_NAMES.objects)!.elements).toEqual([]);
    expect(paperImport.regions.map((r) => r.kind)).toEqual(["formula", "formula"]);
    expect(paperImport.regions.map((r) => r.elementIds[0])).toEqual(text.elements.map((e) => e.id));
  });
});
