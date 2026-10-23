import type { ModelJobCompletion } from "@haex-space/vault-sdk";
import { describe, expect, it } from "vitest";
import { fitImage } from "./layout";
import { outcomeOf, placeRegions, textOrTableElement, type PageJobOutcome, type PlacedRegion } from "./mapResult";
import { PAGE_FORMAT } from "./pageJob";
import manifest from "./fixtures/manifest.json";

const page = { width: 794, height: 1123 };

/** What holzi would answer for a recorded run. */
const completionOf = (read: unknown, fix: unknown): ModelJobCompletion => ({
  jobId: "fixture",
  status: "completed",
  result: { steps: [{ id: "read", result: read }, { id: "fix", result: fix }], final: fix },
  provenance: [
    { stepId: "read", formatName: "page-recognition", formatVersion: 1, attempts: [{ model: manifest.model, place: "this_device", effort: "medium", outcome: "used" }] },
    { stepId: "fix", formatName: "text-fix", formatVersion: 1, attempts: [] },
  ],
} as unknown as ModelJobCompletion);

const outcomes = manifest.fixtures.map((fixture) => ({
  fixture,
  outcome: outcomeOf({ completion: completionOf(fixture.read, fixture.fix) }) as Extract<PageJobOutcome, { kind: "completed" }>,
}));

const placedOf = (outcome: Extract<PageJobOutcome, { kind: "completed" }>, fixture: { width: number; height: number }): PlacedRegion[] =>
  placeRegions(outcome, fitImage(fixture.width, fixture.height, page.width, page.height), page.width);

describe.each(outcomes)("fixture $fixture.file", ({ fixture, outcome }) => {
  it("is a recorded answer in the format of the contract", () => {
    const schema = PAGE_FORMAT.schema as { properties: { regions: { items: { properties: { kind: { enum: string[] } } } } } };
    for (const region of fixture.read.regions) {
      expect(schema.properties.regions.items.properties.kind.enum).toContain(region.kind);
      expect(region.box).toHaveLength(4);
      expect(region.box.every((n) => n >= 0 && n <= 1000)).toBe(true);
    }
    expect(outcome.model).toBe(manifest.model);
  });

  it("gives the regions that were expected", () => {
    const kinds = (kind: string) => outcome.regions.filter((r) => r.kind === kind).length;
    expect([kinds("text"), kinds("table"), kinds("image")]).toEqual([fixture.expect.texts, fixture.expect.tables, fixture.expect.images]);
    expect(outcome.rotation).toBe(fixture.expect.rotationHint);
  });

  it("corrects the misspelling by the most similar text, although the fix step wrote extra texts", () => {
    const read = outcome.regions.flatMap((r) => (r.text ? [r.text] : []));
    expect(read.some((t) => t.includes("Seure"))).toBe(fixture.expect.readHasTypo);
    const used = outcome.texts ?? [];
    expect(used).toHaveLength(read.length);
    expect(used.some((t) => t.includes("Seure"))).toBe(false);
    expect(used.some((t) => t.includes("Säure oder Base"))).toBe(fixture.expect.typoFixed);
    // The correction never rewrites: each text stays close to what was read.
    for (const [i, text] of used.entries()) expect(text.length).toBeLessThan(read[i]!.length * 1.2 + 4);
  });

  it("places every region inside the page, apart from each other", () => {
    const placed = placedOf(outcome, fixture);
    expect(placed).toHaveLength(outcome.regions.length);
    for (const { rect } of placed) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(page.width + 1);
    }
    placed.forEach((a, i) => placed.slice(i + 1).forEach((b) => {
      const apart = a.rect.x + a.rect.width <= b.rect.x || b.rect.x + b.rect.width <= a.rect.x
        || a.rect.y + a.rect.height <= b.rect.y || b.rect.y + b.rect.height <= a.rect.y;
      expect(apart).toBe(true);
    }));
  });

  it("makes the table of the page an editable table with its cells", () => {
    const table = placedOf(outcome, fixture).find((p) => p.region.kind === "table")!;
    const element = textOrTableElement(table, "t1", "Caveat");
    expect(element).toMatchObject({ type: "table", columns: 3, rows: 3, cells: [["Stoff", "pH-Wert", "Farbe"], ["Zitronensaft", "2", "rot"], ["Seifenlauge", "12", "blau"]] });
  });
});
