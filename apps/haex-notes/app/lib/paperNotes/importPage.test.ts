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

  it("puts the original on a locked layer under text, objects and an own layer", async () => {
    const { deps } = fakes([read]);
    const { layers, paperImport } = await importPhotoAsync(photo, page, "Caveat", deps);

    expect(layers.map((l) => [l.name, l.locked, l.elements.map((e) => e.type)])).toEqual([
      [LAYER_NAMES.original, true, ["image"]],
      [LAYER_NAMES.text, false, ["text"]],
      [LAYER_NAMES.objects, false, ["table", "image"]],
      [LAYER_NAMES.own, false, []],
    ]);
    expect(paperImport.regions.map((r) => r.kind)).toEqual(["text", "table", "image"]);
    const crop = layers[2]!.elements[1] as ImageElement;
    expect(crop.source).toEqual({ kind: "asset", assetId: `asset-crop-${crop.id}.jpg` });
    expect(paperImport.regions[2]!.elementIds).toEqual([crop.id]);
  });

  it("turns the copy and reads once more after a rotation hint, but not twice", async () => {
    const { deps, copies, jobs } = fakes([{ ...read, rotation: 90 }, { ...read, rotation: 90 }]);
    const { paperImport, layers } = await importPhotoAsync({ ...photo, rotation: 270 }, page, "Caveat", deps);

    expect(copies).toEqual([270, 0]);
    expect(jobs).toHaveLength(2);
    expect(paperImport.rotation).toBe(0);
    expect((layers[0]!.elements[0] as ImageElement).rotation).toBe(0);
  });

  it("shows a turned original upright over the copy", async () => {
    const { deps } = fakes([read]);
    const { layers } = await importPhotoAsync({ ...photo, rotation: 90 }, page, "Caveat", deps);
    const original = layers[0]!.elements[0] as ImageElement;
    expect(original.rotation).toBeCloseTo(Math.PI / 2);
    // Turned by a quarter, its long side runs across the page like the copy's short side.
    expect(original.height).toBeCloseTo(original.width * (4000 / 3000));
  });

  it("leaves a page with only the original for each error and a cancel", async () => {
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
});
