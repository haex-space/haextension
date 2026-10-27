import { describe, expect, it } from "vitest";
import { chemistryToLatex, fromChemistry, fromLatex, latexOf, toChemistry, toLatex } from "./formulaNotation";
import { renderLatexAsync } from "./math";

/** Der Abstand zwischen Teilen ist für LaTeX gleich; verglichen wird ohne Mehrfachleerzeichen. */
const tex = (text: string) => toLatex(text).replace(/\s+/g, " ");

describe("toLatex", () => {
  it("sets exponents and indices", () => {
    expect(tex("a^2 + b^2 = c^2")).toBe("a^{2} + b^{2} = c^{2}");
    expect(tex("E_pot = m_p * g * h")).toBe("E_{pot} = m_{p} \\cdot g \\cdot h");
    expect(tex("x^(n+1)")).toBe("x^{n + 1}");
    expect(tex("T_1")).toBe("T_{1}");
  });

  it("takes the superscripts and subscripts that the symbol buttons type", () => {
    expect(tex("x²")).toBe("x^{2}");
    expect(tex("H₂O")).toBe("H_{2}O");
    expect(tex("20°")).toBe("20^{\\circ}");
  });

  it("makes fractions of the neighbours", () => {
    expect(tex("3/4")).toBe("\\frac{3}{4}");
    expect(tex("(a+b)/2")).toBe("\\frac{a + b}{2}");
    expect(tex("x^2/3")).toBe("\\frac{x^{2}}{3}");
  });

  it("sets roots, with the word or the sign", () => {
    expect(tex("sqrt(2)")).toBe("\\sqrt{2}");
    expect(tex("wurzel(a+b)")).toBe("\\sqrt{a + b}");
    expect(tex("√2")).toBe("\\sqrt{2}");
  });

  it("sets units upright with a small gap after a number and the decimal comma without a space", () => {
    expect(tex("480 kcal = 2011,2 kJ")).toBe("480\\,\\mathrm{kcal} = 2011{,}2\\,\\mathrm{kJ}");
  });

  it("knows arrows, comparisons and Greek letters", () => {
    expect(tex("A -> B")).toBe("A \\rightarrow B");
    expect(tex("A <=> B")).toBe("A \\rightleftharpoons B");
    expect(tex("a >= b")).toBe("a \\ge b");
    expect(tex("2 * pi * r")).toBe("2 \\cdot \\pi \\cdot r");
    expect(tex("π")).toBe("\\pi");
  });

  it("never lets a typed character break the formula", () => {
    expect(tex("50% von $x")).not.toContain("$");
    expect(tex("a_")).toBe("a");
    expect(toLatex("")).toBe("");
  });

  it.each([
    "a^2 + b^2 = c^2",
    "E_pot = m_p * g * h",
    "480 kcal = 2011,2 kJ",
    "x²/3 + sqrt(2)",
    "(a+b)/2",
    "Delta E = m * c^2",
    "50%",
    "a ( b",
  ])("gives LaTeX that MathJax can set: %s", async (simple) => {
    expect("error" in (await renderLatexAsync(toLatex(simple)))).toBe(false);
  });
});

describe("chemistry", () => {
  it("wraps what the student writes in \\ce and leaves the writing to mhchem", () => {
    expect(chemistryToLatex("H2SO3 + H2O -> H3O+ + HSO3-")).toBe("\\ce{H2SO3 + H2O -> H3O+ + HSO3-}");
    expect(chemistryToLatex("")).toBe("");
  });

  it("takes the arrows and indices that the buttons and the keyboard type", () => {
    expect(toChemistry("H₂SO₃ + H₂O → H₃O⁺ + HSO₃⁻")).toBe("H2SO3 + H2O -> H3O^+ + HSO3^-");
    expect(toChemistry("A ⇌ B")).toBe("A <=> B");
    expect(toChemistry("SO₄²⁻")).toBe("SO4^2-");
  });

  it("reads the inside of \\ce back, and nothing else", () => {
    expect(fromChemistry("\\ce{H2O}")).toBe("H2O");
    expect(fromChemistry("\\ce{\\frac{1}{2} O2}")).toBe("\\frac{1}{2} O2");
    expect(fromChemistry("\\ce{H2O} + 1")).toBeNull();
    expect(fromChemistry("\\ce{H2O")).toBeNull();
    expect(fromChemistry("a^2")).toBeNull();
  });

  it("gives LaTeX that MathJax can set", async () => {
    const result = await renderLatexAsync(chemistryToLatex("H2SO3 + H2O -> H3O+ + HSO3-"));
    expect("error" in result).toBe(false);
  });
});

describe("fromLatex", () => {
  it("shows the usual output of a model in the simple writing", () => {
    expect(fromLatex("a^{2} + b^{2} = c^{2}")).toBe("a^2 + b^2 = c^2");
    expect(fromLatex("E_{pot} = m_{p} \\cdot g \\cdot h")).toBe("E_pot = m_p * g * h");
    expect(fromLatex("\\frac{3}{4}")).toBe("3/4");
    expect(fromLatex("\\frac{a+b}{2}")).toBe("(a+b)/2");
    expect(fromLatex("\\sqrt{2}")).toBe("sqrt(2)");
    expect(fromLatex("480\\,\\mathrm{kcal} = 2011{,}2\\,\\mathrm{kJ}")).toBe("480 kcal = 2011,2 kJ");
    expect(fromLatex("A \\rightarrow B")).toBe("A -> B");
  });

  it("gives up on what the simple writing cannot say", () => {
    expect(fromLatex("\\sum_{i=1}^{n} i")).toBeNull();
    expect(fromLatex("\\begin{matrix} a \\end{matrix}")).toBeNull();
  });

  it.each([
    "a^2 + b^2 = c^2",
    "E_pot = m_p * g * h",
    "3/4",
    "(a + b)/2",
    "sqrt(2)",
    "480 kcal",
    "A -> B",
  ])("comes back to the same text through toLatex: %s", (simple) => {
    expect(fromLatex(toLatex(simple))).toBe(simple);
  });
});

describe("latexOf", () => {
  it("uses the writing of the mode and takes LaTeX as it is", () => {
    expect(latexOf("chemistry", "H2O")).toBe("\\ce{H2O}");
    expect(latexOf("math", "a^2")).toBe("a^{2}");
    expect(latexOf("latex", "  \\alpha  ")).toBe("\\alpha");
  });
});
