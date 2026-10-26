import type { ModelJobCompletion } from "@haex-space/vault-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { loadMathAsync } from "../math";
import { formulaElement, imageElement, outcomeOf, placeRegions, textOrTableElement, type PageJobOutcome } from "./mapResult";

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

  it("matches each corrected text to the read text it is most like, not by position", () => {
    const reordered = { texts: ["Zur Auswahl!", "Reaktion von Säurelösungen\nmit Metallen."] };
    expect(done(completed(read, reordered)).texts).toEqual(["Reaktion von Säurelösungen\nmit Metallen.", "Zur Auswahl!"]);
  });

  it("ignores extra texts, such as table cells the model wrote out, and keeps what has no correction", () => {
    const extra = { texts: ["Tag", "Fach", "Di", "Reaktion von Säurelösungen\nmit Metallen"] };
    expect(done(completed(read, extra)).texts).toEqual(["Reaktion von Säurelösungen\nmit Metallen", "Zur Auswahl"]);
    expect(done(completed(read, { texts: ["nur einer"] })).texts).toEqual(["Reaktion von Säurelösungen\nmit Metallen", "Zur Auswahl"]);
  });

  it("refuses a rewrite and answers without the format of a text fix", () => {
    const rewritten = { texts: ["Alles ganz anders formuliert, mit neuem Inhalt", "Zur Auswahl"] };
    expect(done(completed(read, rewritten)).texts).toEqual(["Reaktion von Säurelösungen\nmit Metallen", "Zur Auswahl"]);
    expect(done(completed(read, { texts: [1, 2] })).texts).toBeNull();
    expect(done(completed(read, { other: [] })).texts).toBeNull();
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

  it("uses the corrected texts, and the read ones without a fitting correction", () => {
    const corrected = placeRegions(done(completed(read, { texts: ["Reaktion von Säurelösungen\nmit Metallen.", "Zur Auswahl!"] })), fit, 794);
    expect([corrected[0]!.text, corrected[3]!.text]).toEqual(["Reaktion von Säurelösungen\nmit Metallen.", "Zur Auswahl!"]);
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

describe("formula regions", () => {
  beforeAll(loadMathAsync);
  const fit = { x: 40, y: 40, width: 700, height: 1000, scale: 1 };
  const page = (...regions: unknown[]) => ({ regions, rotation: 0 });

  it("reads the latex of a formula line and leaves a text next to it out of the corrections", () => {
    const outcome = done(completed(page(
      { kind: "formula", box: [100, 100, 700, 160], latex: "\\ce{H2SO3 + H2O -> H3O+ + HSO3-}", text: "ignored" },
      { kind: "text", box: [100, 200, 600, 250], text: "Zur Auswahl" },
    ), { texts: ["Zur Auswahl!"] }));
    expect(outcome.regions[0]).toEqual({ kind: "formula", box: [100, 100, 700, 160], latex: "\\ce{H2SO3 + H2O -> H3O+ + HSO3-}" });
    const placed = placeRegions(outcome, fit, 794);
    expect(placed.map((p) => p.region.kind)).toEqual(["formula", "text"]);
    expect(placed[0]!.latex).toBe("\\ce{H2SO3 + H2O -> H3O+ + HSO3-}");
    expect(placed[1]!.text).toBe("Zur Auswahl!");
  });

  it("skips a formula line without a source", () => {
    const outcome = done(completed(page({ kind: "formula", box: [0, 0, 500, 100] }, { kind: "formula", box: [0, 200, 500, 300], latex: "  " }), { texts: [] }));
    expect(placeRegions(outcome, fit, 794)).toEqual([]);
  });

  it("sets a formula line into a formula element at the font size of a text block of its height", async () => {
    const [placed] = placeRegions(done(completed(page({ kind: "formula", box: [100, 100, 900, 160], latex: "x^2" }), { texts: [] })), fit, 794);
    const element = await formulaElement(placed!, "f1", "Caveat");
    expect(element).toMatchObject({ type: "latex", id: "f1", source: "x^2", color: "#1f2937", rotation: 0, x: placed!.rect.x });
    if (element.type !== "latex") return;
    expect(element.svg.startsWith("<svg")).toBe(true);
    expect(element.height).toBeGreaterThan(0);
    expect(element.height).toBeLessThanOrEqual(placed!.rect.height);
    expect(element.width).toBeLessThanOrEqual(placed!.rect.width);
    expect(element.bbox[2]).toBeGreaterThan(0);
  });

  it("shrinks a formula that is wider than its box", async () => {
    const wide = "a+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p+q+r+s+t+u+v+w+x+y+z";
    const [placed] = placeRegions(done(completed(page({ kind: "formula", box: [100, 100, 200, 160], latex: wide }), { texts: [] })), fit, 794);
    const element = await formulaElement(placed!, "f2", "Caveat");
    expect(element.type).toBe("latex");
    expect(element.width).toBeLessThanOrEqual(placed!.rect.width + 0.001);
  });

  it("keeps the source as text when it cannot be set, so that nothing is lost", async () => {
    const [placed] = placeRegions(done(completed(page({ kind: "formula", box: [100, 100, 900, 160], latex: "\\frac{1" }), { texts: [] })), fit, 794);
    const element = await formulaElement(placed!, "f3", "Caveat");
    expect(element).toMatchObject({ type: "text", id: "f3", text: "\\frac{1", fontFamily: "Caveat" });
  });
});
