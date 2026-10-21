import type { ModelJobCompletion } from "@haex-space/vault-sdk";
import { describe, expect, it } from "vitest";
import { imageElement, outcomeOf, placeRegions, textOrTableElement, type PageJobOutcome } from "./mapResult";

const read = {
  regions: [
    { kind: "text", box: [100, 100, 600, 150], text: "Reaktion von Säurelösungen\nmit Metallen" },
    { kind: "table", box: [100, 200, 900, 400], rows: [["Tag", "Fach"], ["Di"]] },
    { kind: "image", box: [100, 450, 500, 700] },
    { kind: "text", box: [100, 750, 600, 800], text: "Zur Auswahl" },
  ],
  rotation: 0,
};

const completed = (result: unknown, fix: unknown = { texts: ["Reaktion von Säurelösungen\nmit Metallen", "Zur Auswahl"] }): ModelJobCompletion => ({
  jobId: "j1",
  status: "completed",
  result: { steps: [{ id: "read", result }, { id: "fix", result: fix }], final: fix },
  provenance: [
    { stepId: "read", formatName: "page-recognition", formatVersion: 1, attempts: [
      { model: "llava", place: "cloud", effort: "medium", outcome: "unusable", reason: "loop" },
      { model: "qwen3-vl:4b-instruct", place: "this_device", effort: "medium", outcome: "used" },
    ] },
    { stepId: "fix", formatName: "text-fix", formatVersion: 1, attempts: [] },
  ],
});

const done = (completion: ModelJobCompletion) => outcomeOf({ completion }) as Extract<PageJobOutcome, { kind: "completed" }>;

describe("outcomeOf", () => {
  it("takes the regions, the corrected texts and the model that read the page", () => {
    const outcome = done(completed(read));
    expect(outcome.regions).toHaveLength(4);
    expect(outcome.rotation).toBe(0);
    expect(outcome.texts).toEqual(["Reaktion von Säurelösungen\nmit Metallen", "Zur Auswahl"]);
    expect([outcome.model, outcome.place]).toEqual(["qwen3-vl:4b-instruct", "this_device"]);
  });

  it("keeps the read texts when the number of corrected texts does not match", () => {
    expect(done(completed(read, { texts: ["nur einer"] })).texts).toBeNull();
    expect(done(completed(read, { texts: [1, 2] })).texts).toBeNull();
  });

  it("reads the rotation hint and ignores anything but a quarter turn", () => {
    expect(done(completed({ ...read, rotation: 90 })).rotation).toBe(90);
    expect(done(completed({ ...read, rotation: 45 })).rotation).toBe(0);
  });

  it("maps each end and refusal to the hint of the contract", () => {
    const failed = (code: string): ModelJobCompletion => ({
      jobId: "j", status: "failed", provenance: [], error: { code, message: "" },
    } as unknown as ModelJobCompletion);
    expect(outcomeOf({ completion: failed("unusable") })).toEqual({ kind: "failed", error: "unusable" });
    expect(outcomeOf({ completion: failed("timeout") })).toEqual({ kind: "failed", error: "timeout" });
    expect(outcomeOf({ completion: failed("something_new") })).toEqual({ kind: "failed", error: "unavailable" });
    expect(outcomeOf({ completion: { jobId: "j", status: "cancelled", provenance: [] } })).toEqual({ kind: "cancelled" });
    expect(outcomeOf({ rejection: { code: 1002, message: "denied" } })).toEqual({ kind: "failed", error: "consent_denied" });
    expect(outcomeOf({ rejection: { code: 8001, details: { reason: "no_capable_model" } } }))
      .toEqual({ kind: "failed", error: "no_capable_model" });
    expect(outcomeOf({ rejection: new Error("gone") })).toEqual({ kind: "failed", error: "unavailable" });
  });
});

describe("placeRegions", () => {
  const fit = { x: 40, y: 40, width: 700, height: 1000, scale: 1 };

  it("places regions with content and pads table rows to the longest", () => {
    const placed = placeRegions(done(completed(read)), fit, 794);
    expect(placed.map((p) => p.region.kind)).toEqual(["text", "table", "image", "text"]);
    expect(placed[0]!.rect).toEqual({ x: 110, y: 140, width: 350, height: 50 });
    expect(placed[1]!.rows).toEqual([["Tag", "Fach"], ["Di", ""]]);
  });

  it("uses the corrected texts in order, and the read ones without a fitting correction", () => {
    const corrected = placeRegions(done(completed(read, { texts: ["Reaktion", "Auswahl"] })), fit, 794);
    expect([corrected[0]!.text, corrected[3]!.text]).toEqual(["Reaktion", "Auswahl"]);
    const unfixed = placeRegions(done(completed(read, { texts: ["x"] })), fit, 794);
    expect(unfixed[3]!.text).toBe("Zur Auswahl");
  });

  it("skips empty regions and boxes without area", () => {
    const page = { regions: [
      { kind: "text", box: [0, 0, 100, 100], text: "  " },
      { kind: "table", box: [0, 0, 100, 100], rows: [] },
      { kind: "image", box: [300, 300, 300, 400] },
      { kind: "image", box: [0, 0, 100] },
    ] };
    expect(placeRegions(done(completed(page, { texts: [] })), fit, 794)).toEqual([]);
  });
});

describe("elements", () => {
  const fit = { x: 40, y: 40, width: 700, height: 1000, scale: 1 };
  const placed = placeRegions(done(completed(read)), fit, 794);

  it("makes a text with a font size from its lines and a table with its cells", () => {
    const text = textOrTableElement(placed[0]!, "e1", "Caveat");
    expect(text).toMatchObject({ type: "text", fontFamily: "Caveat", fontSize: 20, text: "Reaktion von Säurelösungen\nmit Metallen" });
    const table = textOrTableElement(placed[1]!, "e2", "Caveat");
    expect(table).toMatchObject({ type: "table", columns: 2, rows: 2, cells: [["Tag", "Fach"], ["Di", ""]] });
    expect(textOrTableElement(placed[2]!, "e3", "Caveat")).toBeNull();
  });

  it("makes an image element from the crop of its region", () => {
    expect(imageElement(placed[2]!, "e3", "crop")).toMatchObject({
      type: "image", source: { kind: "asset", assetId: "crop" }, x: 110, y: 490, width: 280, height: 250,
    });
  });
});
