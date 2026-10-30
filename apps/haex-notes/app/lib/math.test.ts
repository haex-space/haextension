import { beforeAll, describe, expect, it } from "vitest";
import { formulaOfCell, isMathLoaded, loadMathAsync, paint, renderLatex, renderLatexAsync, sizeOf, svgDataUrl } from "./math";

describe("renderLatex", () => {
  beforeAll(loadMathAsync);

  it("sets a formula to an svg with a size", () => {
    const result = renderLatex("x^2 + \\frac{1}{2}");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("sets a root with a degree", () => {
    expect("error" in renderLatex("\\sqrt[3]{27}")).toBe(false);
  });

  it("sets a reaction equation of chemistry with mhchem", () => {
    const result = renderLatex("\\ce{H2SO3 + H2O -> H3O+ + HSO3-}");
    expect("error" in result).toBe(false);
    // An equation with an arrow is wider than the formula of one molecule.
    const molecule = renderLatex("\\ce{H2SO3}");
    if ("error" in result || "error" in molecule) throw new Error("not set");
    expect(result.width).toBeGreaterThan(molecule.width * 2);
  });

  it("keeps currentColor in the svg, so that the colour is chosen when it is drawn", () => {
    const result = renderLatex("a+b");
    if ("error" in result) throw new Error(result.error);
    expect(result.svg).toContain("currentColor");
  });

  it("gives an error with a reason instead of throwing for a source that cannot be set", () => {
    expect(renderLatex("\\frac{1")).toEqual({ error: expect.stringContaining("brace") });
    expect(renderLatex("\\nosuchcommand")).toEqual({ error: expect.any(String) });
    expect(renderLatex("   ")).toEqual({ error: "empty" });
  });

  it("is usable again after an error", () => {
    renderLatex("\\frac{1");
    expect("error" in renderLatex("a")).toBe(false);
  });

  it("loads on demand and then sets without waiting", async () => {
    const result = await renderLatexAsync("E = mc^2");
    expect("error" in result).toBe(false);
    expect(isMathLoaded()).toBe(true);
  });
});

describe("svg helpers", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4.2ex" height="2.1ex" viewBox="0 -883.9 2000 1000"><g fill="currentColor" stroke="currentColor"/></svg>';

  it("reads the size in em from the view box", () => {
    expect(sizeOf(svg)).toEqual({ width: 2, height: 1 });
    expect(sizeOf("<svg></svg>")).toBeNull();
    expect(sizeOf('<svg viewBox="0 0 0 0"></svg>')).toBeNull();
  });

  it("paints the ink colour and a size in pixels, and keeps the rest", () => {
    const painted = paint(svg, "#1f2937", 40, 20);
    expect(painted).toContain('width="40"');
    expect(painted).toContain('height="20"');
    expect(painted).not.toContain("ex\"");
    expect(painted).not.toContain("currentColor");
    expect(painted).toContain('fill="#1f2937"');
    expect(painted).toContain('viewBox="0 -883.9 2000 1000"');
  });

  it("makes a data url that an image can load", () => {
    const url = svgDataUrl(paint(svg, "#000", 10, 10));
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",")[1]!)).toContain("<svg");
  });
});

describe("formulaOfCell", () => {
  it("takes a cell that is only a formula", () => {
    expect(formulaOfCell("$\\ce{HCl}$")).toBe("\\ce{HCl}");
    expect(formulaOfCell("  $ x^2 $  ")).toBe("x^2");
  });

  it("leaves a cell with other text, an unclosed one, and an empty one", () => {
    expect(formulaOfCell("Der Wert $x$ ist")).toBeNull();
    expect(formulaOfCell("$x")).toBeNull();
    expect(formulaOfCell("$$")).toBeNull();
    expect(formulaOfCell("")).toBeNull();
    expect(formulaOfCell("Chlorid-Ionen")).toBeNull();
  });
});
