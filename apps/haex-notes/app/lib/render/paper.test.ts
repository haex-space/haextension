import { describe, expect, it } from "vitest";
import { drawPaper } from "~/lib/render/paper";
import type { PageBackground } from "~/types/document";
import { DEFAULT_MARGINS } from "~/utils/pageTemplates";

/** Ein Canvas-Kontext, der nur die Striche mitschreibt. */
function recordingContext() {
  const moves: [number, number][] = [];
  const lines: [number, number][] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_target, name) => {
      if (name === "moveTo") return (x: number, y: number) => moves.push([x, y]);
      if (name === "lineTo") return (x: number, y: number) => lines.push([x, y]);
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, points: () => [...moves, ...lines] };
}

const grid: PageBackground = { paperColor: "#ffffff", template: "grid" };

function bounds(points: [number, number][]) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

describe("drawPaper margins", () => {
  it("draws the template inside the standard margins", () => {
    const { ctx, points } = recordingContext();
    drawPaper(ctx, grid, 794, 1123);
    expect(bounds(points())).toEqual({
      left: DEFAULT_MARGINS.left,
      right: 794 - DEFAULT_MARGINS.right,
      top: DEFAULT_MARGINS.top,
      bottom: 1123 - DEFAULT_MARGINS.bottom,
    });
  });

  it("draws the template inside the page's own margins", () => {
    const { ctx, points } = recordingContext();
    drawPaper(ctx, { ...grid, margins: { top: 100, bottom: 120, left: 140, right: 160 } }, 794, 1123);
    expect(bounds(points())).toEqual({ left: 140, right: 794 - 160, top: 100, bottom: 1123 - 120 });
  });

  it("keeps every line-based template inside custom margins", () => {
    const margins = { top: 100, bottom: 120, left: 140, right: 160 };
    const templates = ["lined", "grid", "grid-large", "dotgrid", "lineatur1", "lineatur2", "lineatur3", "music", "millimeter"] as const;
    for (const template of templates) {
      const { ctx, points } = recordingContext();
      drawPaper(ctx, { ...grid, template, margins }, 794, 1123);
      expect(points().every(([x, y]) => x >= margins.left && x <= 794 - margins.right && y >= margins.top && y <= 1123 - margins.bottom)).toBe(true);
    }
  });
});
