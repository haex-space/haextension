import { describe, expect, it } from "vitest";
import { alignText, BASELINE_SHARE, freeTop, lineStepOf, MAX_MULTIPLE, multipleOf, rowsOf, snapTop, textRowsFor, type PaperRows } from "./paperRows";
import type { PageBackground, PageTemplate } from "~/types/document";

const background = (template: PageTemplate, margins?: PageBackground["margins"]): PageBackground =>
  ({ paperColor: "#ffffff", template, ...(margins ? { margins } : {}) });

const grid = rowsOf(background("grid"))!;

describe("rowsOf", () => {
  it.each(["blank", "music"] as const)("has no rows on %s paper", (template) => {
    expect(rowsOf(background(template))).toBeNull();
  });

  it.each(["lined", "grid", "grid-large", "dotgrid", "millimeter", "lineatur1", "lineatur2", "lineatur3"] as const)(
    "has rows on %s paper whose text fits one row",
    (template) => {
      const rows = rowsOf(background(template))!;
      expect(rows.fontSize).toBeLessThan(rows.pitch);
      expect(rows.baseline).toBeLessThanOrEqual(rows.pitch);
    },
  );

  it("starts at the top margin of the page", () => {
    expect(rowsOf(background("grid"))!.top).toBe(60);
    expect(rowsOf(background("grid", { top: 100, bottom: 40, left: 50, right: 40 }))!.top).toBe(100);
  });
});

describe("multipleOf", () => {
  it("rounds a line height to whole paper rows", () => {
    expect(multipleOf(grid, 19)).toBe(1);
    expect(multipleOf(grid, 30)).toBe(2);
    expect(multipleOf(grid, 28)).toBe(1);
  });

  it("stays between one and the maximum", () => {
    expect(multipleOf(grid, 2)).toBe(1);
    expect(multipleOf(grid, 10_000)).toBe(MAX_MULTIPLE);
  });
});

describe("textRowsFor", () => {
  it("makes a line as high as the paper rows and scales the font with it", () => {
    expect(textRowsFor(grid, 1)).toEqual({ fontSize: 13, lineHeight: 19 });
    expect(textRowsFor(grid, 2)).toEqual({ fontSize: 26, lineHeight: 38 });
  });
});

describe("snapTop", () => {
  const baselineOf = (rows: PaperRows, top: number, multiple: number) => top + BASELINE_SHARE * rows.pitch * multiple;

  it("puts the first baseline on a ruling of the paper", () => {
    for (const y of [60, 71, 100, 333.3]) {
      const top = snapTop(grid, y, 1);
      expect((baselineOf(grid, top, 1) - grid.top) % grid.pitch).toBeCloseTo(0, 6);
    }
  });

  it("picks the ruling nearest to the given position", () => {
    const top = snapTop(grid, 100, 1);
    expect(Math.abs(top - 100)).toBeLessThanOrEqual(grid.pitch / 2);
  });

  it("puts a double-height line on the second row's baseline", () => {
    const top = snapTop(grid, 0, 2);
    // first usable ruling for k=2 is the bottom of the second row
    expect(baselineOf(grid, top, 2)).toBeCloseTo(grid.top + 2 * grid.pitch, 6);
  });

  it("never lifts a block above the first row", () => {
    expect(snapTop(grid, -500, 1)).toBeGreaterThanOrEqual(grid.top - grid.pitch);
  });

  it("puts the baseline on the Grundlinie of a lineature band", () => {
    const rows = rowsOf(background("lineatur1"))!;
    const top = snapTop(rows, 200, 1);
    expect((baselineOf(rows, top, 1) - rows.top - rows.baseline) % rows.pitch).toBeCloseTo(0, 6);
  });
});

describe("alignText", () => {
  const block = { y: 100, fontSize: 24, lineHeight: undefined };

  it("takes the multiple that is nearest to the size of the text and puts its baseline on a ruling", () => {
    const aligned = alignText(grid, block);
    expect(aligned.lineHeight).toBe(38);
    expect(aligned.fontSize).toBe(26);
    expect((aligned.y + BASELINE_SHARE * aligned.lineHeight - grid.top) % grid.pitch).toBeCloseTo(0, 6);
  });

  it("keeps a headline big", () => {
    expect(alignText(grid, { y: 100, fontSize: 40, lineHeight: undefined }).lineHeight).toBe(57);
  });

  it("uses the given multiple", () => {
    expect(alignText(grid, block, 1)).toMatchObject({ fontSize: 13, lineHeight: 19 });
  });

  it("leaves a block that already sits on the rows where it is", () => {
    const aligned = alignText(grid, block, 2);
    expect(alignText(grid, { y: aligned.y, fontSize: aligned.fontSize, lineHeight: aligned.lineHeight })).toEqual(aligned);
  });
});

describe("freeTop", () => {
  it("keeps the baseline where it was when a block leaves the rows", () => {
    const aligned = alignText(grid, { y: 100, fontSize: 24, lineHeight: undefined }, 2);
    const baseline = aligned.y + BASELINE_SHARE * aligned.lineHeight;
    expect(freeTop(aligned) + 0.85 * aligned.fontSize).toBeCloseTo(baseline, 6);
  });
});

describe("lineStepOf", () => {
  it("is 1.25 font sizes unless the block has a line height", () => {
    expect(lineStepOf({ fontSize: 16 })).toBe(20);
    expect(lineStepOf({ fontSize: 16, lineHeight: 19 })).toBe(19);
  });
});
