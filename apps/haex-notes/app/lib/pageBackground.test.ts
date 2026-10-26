import { describe, expect, it } from "vitest";
import { DEFAULT_PAPER_COLOR } from "~/lib/migratePage";
import { changedBackground, PAPER_COLORS } from "~/lib/pageBackground";
import { PAGE_TEMPLATES } from "~/utils/pageTemplates";
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
