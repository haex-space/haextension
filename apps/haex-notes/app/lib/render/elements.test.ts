import { describe, expect, it, vi } from "vitest";
import type { ImageElement, StrokeElement, TableElement, TextElement } from "~/types/document";
import { drawElement, drawElements, strokeOutlineToPath, type ImageLookup, type StrokePathCache } from "./elements";

describe("strokeOutlineToPath", () => {
  it("returns an empty string for fewer than two points", () => {
    expect(strokeOutlineToPath([])).toBe("");
    expect(strokeOutlineToPath([[0, 0]])).toBe("");
  });

  it("starts with a move and closes the path", () => {
    const path = strokeOutlineToPath([[0, 0], [10, 0], [10, 10]]);
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});

describe("drawElement", () => {
  it("clears the content canvas for eraser strokes", () => {
    vi.stubGlobal("Path2D", vi.fn());
    const context = {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "",
      save: vi.fn(),
      restore: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const eraser: StrokeElement = {
      id: "eraser",
      type: "stroke",
      points: [[0, 0, 0.5], [10, 10, 0.5]],
      color: "#000000",
      size: 4,
      tool: "eraser",
      bbox: [0, 0, 10, 10],
    };

    drawElement(context, eraser);

    expect(context.globalCompositeOperation).toBe("destination-out");
    expect(context.fillStyle).toBe("");
    expect(context.restore).toHaveBeenCalledOnce();
  });
});

describe("drawElements with a path cache", () => {
  const context = () => ({
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    save: vi.fn(),
    restore: vi.fn(),
    fill: vi.fn(),
  }) as unknown as CanvasRenderingContext2D;

  const brush = (): StrokeElement => ({
    id: "s1",
    type: "stroke",
    points: [[0, 0, 0.5], [10, 10, 0.5]],
    color: "#000000",
    size: 4,
    tool: "brush",
    bbox: [-2, -2, 14, 14],
  });

  it("builds a stroke path once while its geometry is unchanged", () => {
    const Path2D = vi.fn();
    vi.stubGlobal("Path2D", Path2D);
    const cache: StrokePathCache = new WeakMap();
    const stroke = brush();

    drawElements(context(), [stroke], cache);
    drawElements(context(), [stroke], cache);
    expect(Path2D).toHaveBeenCalledTimes(1);

    // Jede Geometrieänderung setzt eine neue Hülle.
    stroke.points.push([20, 20, 0.5]);
    stroke.bbox = [-2, -2, 24, 24];
    drawElements(context(), [stroke], cache);
    expect(Path2D).toHaveBeenCalledTimes(2);
  });
});

/** A context that records what is drawn; each character is 10 px wide. */
function recorder() {
  const calls: { name: string; args: unknown[]; font?: string; fillStyle?: unknown; alpha?: number }[] = [];
  const state = { font: "", fillStyle: "" as unknown, strokeStyle: "" as unknown, globalAlpha: 1, lineWidth: 1, textBaseline: "" };
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args, font: state.font, fillStyle: state.fillStyle, alpha: state.globalAlpha });
  };
  const context = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key as keyof typeof target];
      if (key === "measureText") return (text: string) => ({ width: text.length * 10 });
      return record(key);
    },
    set(target, key: string, value) {
      (target as Record<string, unknown>)[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const texts = () => calls.filter((c) => c.name === "fillText").map((c) => c.args);
  const named = (name: string) => calls.filter((c) => c.name === name);
  return { context, calls, texts, named };
}

const text = (overrides: Partial<TextElement> = {}): TextElement => ({
  id: "t", type: "text", x: 10, y: 20, width: 100, height: 40, rotation: 0,
  text: "Reaktion von Metallen", fontFamily: "Caveat", fontSize: 16, color: "#123456",
  bbox: [10, 20, 100, 40], ...overrides,
});

describe("drawElement for text", () => {
  it("wraps at the width, keeps line breaks and uses font and colour", () => {
    const { context, texts, named } = recorder();

    drawElement(context, text({ text: "Reaktion von Metallen\nSalzsäure" }));

    expect(texts()).toEqual([["Reaktion", 10, 20], ["von", 10, 40], ["Metallen", 10, 60], ["Salzsäure", 10, 80]]);
    expect(named("fillText")[0]!.font).toBe("16px Caveat, sans-serif");
    expect(named("fillText")[0]!.fillStyle).toBe("#123456");
  });

  it("turns around the centre when rotated", () => {
    const { context, named } = recorder();
    drawElement(context, text({ rotation: Math.PI / 2 }));
    expect(named("translate")[0]!.args).toEqual([60, 40]);
    expect(named("rotate")[0]!.args).toEqual([Math.PI / 2]);
  });
});

const image = (assetId: string, overrides: Partial<ImageElement> = {}): ImageElement => ({
  id: `img-${assetId}`, type: "image", x: 5, y: 6, width: 70, height: 80, rotation: 0,
  source: { kind: "asset", assetId }, opacity: 0.5, bbox: [5, 6, 70, 80], ...overrides,
});

describe("drawElement for images", () => {
  it("draws a loaded image at its place with its opacity", () => {
    const { context, named } = recorder();
    const bitmap = { width: 1, height: 1 } as unknown as CanvasImageSource;
    const images: ImageLookup = (source) => (source.kind === "asset" && source.assetId === "a" ? bitmap : null);

    drawElement(context, image("a"), undefined, images);

    const drawn = named("drawImage");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.args).toEqual([bitmap, 5, 6, 70, 80]);
    expect(drawn[0]!.alpha).toBe(0.5);
  });

  it("draws a placeholder while the image is missing", () => {
    const { context, named } = recorder();
    drawElement(context, image("missing"), undefined, () => null);
    expect(named("drawImage")).toHaveLength(0);
    expect(named("fillRect")[0]!.args).toEqual([5, 6, 70, 80]);
    expect(named("strokeRect")[0]!.args).toEqual([5, 6, 70, 80]);
  });
});

describe("drawElement for table cells", () => {
  const table = (cells?: unknown): TableElement => ({
    id: "tab", type: "table", x: 0, y: 0, columns: 2, rows: 2,
    columnWidths: [80, 120], rowHeights: [30, 30], bbox: [0, 0, 200, 60],
    ...(cells !== undefined && { cells: cells as string[][] }),
  });

  it("writes each cell's text inside its cell", () => {
    const { context, texts } = recorder();
    drawElement(context, table([["Tag", "Fach"], ["Di", ""]]));
    expect(texts()).toEqual([["Tag", 4, 4], ["Fach", 84, 4], ["Di", 4, 34]]);
  });

  it("draws a table without cells, or with broken ones, as its grid only", () => {
    for (const cells of [undefined, [[1, null]], "x"]) {
      const { context, texts, named } = recorder();
      drawElement(context, table(cells));
      expect(texts()).toEqual([]);
      expect(named("strokeRect")).toHaveLength(1);
    }
  });
});
