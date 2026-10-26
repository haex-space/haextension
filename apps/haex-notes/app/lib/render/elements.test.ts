import { describe, expect, it, vi } from "vitest";
import type { ImageElement, ImageSource, LatexElement, StrokeElement, TableElement, TextElement } from "~/types/document";
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

describe("drawElement for formulas", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4ex" height="2ex" viewBox="0 -883.9 2000 1000"><g fill="currentColor"/></svg>';
  const latex = (overrides: Partial<LatexElement> = {}): LatexElement => ({
    id: "f1", type: "latex", x: 10, y: 20, width: 100, height: 50, rotation: 0,
    source: "x^2", svg, color: "#112233", bbox: [10, 20, 100, 50], ...overrides,
  });

  it("draws the set formula at its place, from its svg in the ink colour, without MathJax", () => {
    const { context, named } = recorder();
    const bitmap = { width: 1, height: 1 } as unknown as CanvasImageSource;
    const asked: unknown[] = [];
    const images: ImageLookup = (source) => { asked.push(source); return bitmap; };

    drawElement(context, latex(), undefined, images);

    expect(named("drawImage")[0]!.args).toEqual([bitmap, 10, 20, 100, 50]);
    const source = asked[0] as { kind: string; dataUrl: string };
    expect(source.kind).toBe("inline");
    const painted = decodeURIComponent(source.dataUrl.split(",")[1]!);
    expect(painted).toContain('fill="#112233"');
    expect(painted).toContain('width="100"');
    expect(painted).not.toContain("currentColor");
  });

  it("asks for the same image source again while the element is unchanged, and for a new one when it changes", () => {
    const sources: ImageSource[] = [];
    const images: ImageLookup = (source) => { sources.push(source as ImageSource); return null; };
    const element = latex();
    drawElement(recorder().context, element, undefined, images);
    drawElement(recorder().context, element, undefined, images);
    expect(sources[1]).toBe(sources[0]);
    drawElement(recorder().context, { ...element, color: "#000000" }, undefined, images);
    expect(sources[2]).not.toBe(sources[0]);
  });

  it("leaves the place empty while the image loads, and turns around the centre when rotated", () => {
    const { context, named } = recorder();
    drawElement(context, latex(), undefined, () => null);
    expect(named("drawImage")).toHaveLength(0);
    const turned = recorder();
    drawElement(turned.context, latex({ rotation: Math.PI / 2 }), undefined, () => ({ width: 1 }) as unknown as CanvasImageSource);
    expect(turned.named("rotate")[0]!.args).toEqual([Math.PI / 2]);
  });

  it("draws a cell that is only a formula as a formula, at the size of the cell font, and leaves other cells as text", () => {
    const { context, named, texts } = recorder();
    const bitmap = { width: 64, height: 32 } as unknown as CanvasImageSource;
    const asked: unknown[] = [];
    const images: ImageLookup = (source) => { asked.push(source); return source.kind === "formula" ? bitmap : null; };

    drawElement(context, {
      id: "tab", type: "table", x: 0, y: 0, columns: 2, rows: 1, columnWidths: [80, 120], rowHeights: [40],
      cells: [["$\\ce{HCl}$", "Chlorid-Ionen"]], bbox: [0, 0, 200, 40],
    }, undefined, images);

    expect(asked).toEqual([{ kind: "formula", source: "\\ce{HCl}", color: "#1f2937" }]);
    // 64 × 32 px at 16 px per em, drawn in the 14 px font: 56 × 28, centred in the 40 px high row.
    expect(named("drawImage")[0]!.args).toEqual([bitmap, 4, 6, 56, 28]);
    expect(texts()).toEqual([["Chlorid-Ionen", 84, 4]]);
  });

  it("shrinks a formula that is larger than its cell, and shows the source while it is not set", () => {
    const big = { width: 640, height: 320 } as unknown as CanvasImageSource;
    const sized = recorder();
    const single = (cell: string): TableElement => ({
      id: "tab", type: "table", x: 0, y: 0, columns: 1, rows: 1, columnWidths: [80], rowHeights: [40],
      cells: [[cell]], bbox: [0, 0, 80, 40],
    });
    drawElement(sized.context, single("$x$"), undefined, () => big);
    const [, x, , width, height] = sized.named("drawImage")[0]!.args as number[];
    expect(x).toBe(4);
    expect(width).toBeLessThanOrEqual(72);
    expect(height).toBeLessThanOrEqual(32);
    expect(width! / height!).toBeCloseTo(2);

    const waiting = recorder();
    drawElement(waiting.context, single("$\\ce{HCl}$"), undefined, () => null);
    expect(waiting.named("drawImage")).toHaveLength(0);
    expect(waiting.texts()).toEqual([["$\\ce{HCl}$", 4, 4]]);
  });
});
