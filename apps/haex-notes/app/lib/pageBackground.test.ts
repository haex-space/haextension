import { describe, expect, it } from "vitest";
import { DEFAULT_PAPER_COLOR } from "~/lib/migratePage";
import {
  changedBackground, changedMargin, MARGIN_MAX, marginsOf, mmToPx, PAPER_COLORS, pxToMm, resetMargins,
} from "~/lib/pageBackground";
import { DEFAULT_MARGINS, PAGE_TEMPLATES } from "~/utils/pageTemplates";
import type { PageBackground } from "~/types/document";

const lined: PageBackground = { paperColor: "#ffffff", template: "lined" };

describe("changedBackground", () => {
  it("changes the template and keeps the paper", () => {
    expect(changedBackground(lined, { template: "grid" })).toEqual({ paperColor: "#ffffff", template: "grid" });
  });

  it("changes the paper colour and keeps the template", () => {
    expect(changedBackground(lined, { paperColor: "#fef3c7" })).toEqual({ paperColor: "#fef3c7", template: "lined" });
  });

  it("changes nothing when the choice is already the page's", () => {
    expect(changedBackground(lined, { template: "lined" })).toBeNull();
    expect(changedBackground(lined, { paperColor: "#ffffff" })).toBeNull();
  });

  it("keeps the background image of a pdf or photo page", () => {
    const overlay = { kind: "image", source: "assets/a.png" } as unknown as PageBackground["overlay"];
    expect(changedBackground({ ...lined, overlay }, { template: "grid" })?.overlay).toBe(overlay);
  });
});

describe("PAPER_COLORS", () => {
  it("starts with the standard paper and holds valid, distinct colours", () => {
    expect(PAPER_COLORS[0]?.color).toBe(DEFAULT_PAPER_COLOR);
    const colors = PAPER_COLORS.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("PAGE_TEMPLATES", () => {
  it("offers the templates the model knows, grid paper among them", () => {
    expect(PAGE_TEMPLATES.map((t) => t.id)).toContain("grid");
  });
});

describe("marginsOf", () => {
  it("falls back to the standard margins", () => {
    expect(marginsOf(lined)).toEqual(DEFAULT_MARGINS);
  });

  it("uses the page's own edges and the standard for unusable ones", () => {
    const broken = { top: 10, bottom: -5, left: Number.NaN, right: MARGIN_MAX + 1 } as PageBackground["margins"];
    expect(marginsOf({ ...lined, margins: broken })).toEqual({ ...DEFAULT_MARGINS, top: 10 });
  });
});

describe("changedMargin", () => {
  it("changes one edge and keeps the others at their current value", () => {
    expect(changedMargin(lined, "left", 100)?.margins).toEqual({ ...DEFAULT_MARGINS, left: 100 });
  });

  it("rounds to whole pixels and limits to the allowed range", () => {
    expect(changedMargin(lined, "top", 12.6)?.margins?.top).toBe(13);
    expect(changedMargin(lined, "top", -4)?.margins?.top).toBe(0);
    expect(changedMargin(lined, "top", 9999)?.margins?.top).toBe(MARGIN_MAX);
  });

  it("changes nothing for the current value or an input that is not a number", () => {
    expect(changedMargin(lined, "top", DEFAULT_MARGINS.top)).toBeNull();
    expect(changedMargin(lined, "top", Number.NaN)).toBeNull();
  });

  it("keeps the other background fields", () => {
    const next = changedMargin({ ...lined, paperColor: "#fef3c7" }, "right", 0);
    expect(next).toMatchObject({ template: "lined", paperColor: "#fef3c7" });
  });
});

describe("resetMargins", () => {
  it("drops the page's own margins", () => {
    const own = changedMargin(lined, "left", 100) as PageBackground;
    expect(resetMargins(own)).toEqual(lined);
  });

  it("changes nothing on a page without its own margins", () => {
    expect(resetMargins(lined)).toBeNull();
  });
});

describe("millimetres", () => {
  it("converts between page pixels and millimetres", () => {
    expect(pxToMm(mmToPx(20))).toBe(20);
    expect(pxToMm(DEFAULT_MARGINS.left)).toBe(13);
    expect(pxToMm(MARGIN_MAX)).toBe(80);
  });
});
