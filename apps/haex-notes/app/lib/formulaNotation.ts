/**
 * Die einfache Schreibweise des Formeleditors (Spec 046, FR-031): Schüler tippen eine Formel so, wie sie sie
 * aufschreiben würden, und der Editor macht daraus LaTeX. Es gibt drei Weisen:
 *
 * - `chemistry`: `H2SO3 + H2O -> H3O+ + HSO3-`; mhchem erkennt Indizes und Ladungen selbst, es kommt nur `\ce{…}` herum.
 * - `math` (Mathe und Physik): `E_pot = m * g * h`, `a^2 + b^2 = c^2`, `3/4`, `sqrt(2)`, `480 kcal`.
 * - `latex`: die Quelle selbst, für Fortgeschrittene und für alles, was die einfache Schreibweise nicht kann.
 *
 * Gespeichert wird immer LaTeX (`LatexElement.source`); diese Datei übersetzt hin (`toLatex`, `chemistryToLatex`) und
 * zurück (`fromLatex`, `fromChemistry`), damit der Editor eine gelesene Formel in der einfachen Schreibweise zeigen kann.
 */

export type FormulaMode = "chemistry" | "math" | "latex";

const GREEK: Record<string, string> = {
  pi: "\\pi", alpha: "\\alpha", beta: "\\beta", gamma: "\\gamma", delta: "\\delta", Delta: "\\Delta", theta: "\\theta",
  lambda: "\\lambda", mu: "\\mu", rho: "\\rho", sigma: "\\sigma", Sigma: "\\Sigma", phi: "\\varphi", omega: "\\omega", Omega: "\\Omega",
};
const GREEK_CHARS: Record<string, string> = {
  "π": "pi", "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "Δ": "Delta", "θ": "theta", "λ": "lambda", "μ": "mu",
  "ρ": "rho", "σ": "sigma", "Σ": "Sigma", "φ": "phi", "ω": "omega", "Ω": "Omega",
};
const FUNCTIONS = new Set(["sin", "cos", "tan", "log", "ln"]);
const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Zeichen und Zeichenfolgen, die ein Operator werden, mit dem längsten zuerst. */
const OPERATORS: [string, string][] = [
  ["<=>", "\\rightleftharpoons"], ["<->", "\\leftrightarrow"], ["->", "\\rightarrow"], ["=>", "\\Rightarrow"],
  ["<=", "\\le"], [">=", "\\ge"], ["!=", "\\ne"], ["+-", "\\pm"],
  ["⇌", "\\rightleftharpoons"], ["→", "\\rightarrow"], ["⇒", "\\Rightarrow"], ["≤", "\\le"], ["≥", "\\ge"], ["≠", "\\ne"],
  ["±", "\\pm"], ["≈", "\\approx"], ["~", "\\approx"], ["*", "\\cdot"], ["·", "\\cdot"], ["×", "\\times"], ["÷", "\\div"],
];

type AtomKind = "number" | "unit" | "other";
interface Atom {
  tex: string;
  kind: AtomKind;
  /** Der Inhalt, wenn der Atom eine Klammer war; als Bruchoperand fallen die Klammern weg. */
  inner?: string;
}
type Part = { atom: Atom; space: boolean } | { operator: string };

const isLetter = (char: string | undefined) => !!char && /\p{L}/u.test(char);
const isDigit = (char: string | undefined) => !!char && /\d/.test(char);

class Reader {
  index = 0;
  constructor(readonly text: string) {}
  get done() { return this.index >= this.text.length; }
  peek(offset = 0) { return this.text[this.index + offset]; }
  startsWith(prefix: string) { return this.text.startsWith(prefix, this.index); }
  skipSpaces() {
    const start = this.index;
    while (/\s/.test(this.peek() ?? "x")) this.index++;
    return this.index > start;
  }
  take(pattern: RegExp) {
    const match = pattern.exec(this.text.slice(this.index));
    if (!match) return null;
    this.index += match[0].length;
    return match[0];
  }
}

function readScript(reader: Reader): string | null {
  if (reader.peek() === "(") {
    reader.index++;
    return parseSequence(reader, ")");
  }
  const run = reader.take(/^[+-]?[\p{L}\p{N}]+/u);
  return run;
}

function attachScripts(reader: Reader, atom: Atom): Atom {
  let tex = atom.tex;
  for (;;) {
    const char = reader.peek();
    if (char === "^" || char === "_") {
      const mark = reader.index;
      reader.index++;
      const value = readScript(reader);
      if (value === null) { reader.index = mark + 1; break; }
      tex += `${char}{${value}}`;
    } else if (char && SUPERSCRIPTS.includes(char)) {
      tex += `^{${SUPERSCRIPTS.indexOf(char)}}`;
      reader.index++;
    } else if (char && SUBSCRIPTS.includes(char)) {
      tex += `_{${SUBSCRIPTS.indexOf(char)}}`;
      reader.index++;
    } else if (char === "⁺" || char === "⁻") {
      tex += `^{${char === "⁺" ? "+" : "-"}}`;
      reader.index++;
    } else if (char === "°") {
      tex += "^{\\circ}";
      reader.index++;
    } else break;
  }
  return { ...atom, tex, kind: tex === atom.tex ? atom.kind : "other" };
}

function root(reader: Reader): Atom | null {
  reader.skipSpaces();
  const operand = parseAtom(reader);
  return operand ? { tex: `\\sqrt{${operand.inner ?? operand.tex}}`, kind: "other" } : null;
}

function parseAtom(reader: Reader): Atom | null {
  reader.skipSpaces();
  const char = reader.peek();
  if (char === undefined) return null;
  let atom: Atom | null = null;
  if (char === "(") {
    reader.index++;
    const inner = parseSequence(reader, ")");
    atom = { tex: `(${inner})`, kind: "other", inner };
  } else if (isDigit(char)) {
    const number = reader.take(/^\d+(?:[.,]\d+)?/)!;
    atom = { tex: number.replace(",", "{,}"), kind: "number" };
  } else if (char === "√") {
    reader.index++;
    atom = root(reader) ?? { tex: "\\surd", kind: "other" };
  } else if (GREEK_CHARS[char]) {
    reader.index++;
    atom = { tex: GREEK[GREEK_CHARS[char]!]!, kind: "other" };
  } else if (isLetter(char)) {
    const word = reader.take(/^\p{L}+/u)!;
    if (word === "sqrt" || word === "wurzel") atom = root(reader) ?? { tex: `\\mathrm{${word}}`, kind: "unit" };
    else if (GREEK[word]) atom = { tex: GREEK[word]!, kind: "other" };
    else if (FUNCTIONS.has(word)) atom = { tex: `\\${word}`, kind: "other" };
    else atom = { tex: word.length === 1 ? word : `\\mathrm{${word}}`, kind: word.length === 1 ? "other" : "unit" };
  }
  return atom ? attachScripts(reader, atom) : null;
}

/** Liest bis `closing` (und verbraucht es) oder bis zum Ende. */
function parseSequence(reader: Reader, closing: string | null): string {
  const parts: Part[] = [];
  while (!reader.done) {
    const space = reader.skipSpaces();
    if (reader.done) break;
    if (closing !== null && reader.peek() === closing) { reader.index++; break; }
    const operator = OPERATORS.find(([source]) => reader.startsWith(source));
    if (operator) {
      reader.index += operator[0].length;
      parts.push({ operator: ` ${operator[1]} ` });
      continue;
    }
    const char = reader.peek()!;
    if (char === "/") {
      const previous = parts[parts.length - 1];
      reader.index++;
      const denominator = previous && "atom" in previous ? parseAtom(reader) : null;
      if (previous && "atom" in previous && denominator) {
        const numerator = previous.atom;
        parts[parts.length - 1] = {
          atom: { tex: `\\frac{${numerator.inner ?? numerator.tex}}{${denominator.inner ?? denominator.tex}}`, kind: "other" },
          space: previous.space,
        };
      } else {
        parts.push({ operator: "/" });
      }
      continue;
    }
    const atom = parseAtom(reader);
    if (atom) {
      parts.push({ atom, space });
      continue;
    }
    reader.index++;
    const previous = parts[parts.length - 1];
    if ("+=<>".includes(char) || (char === "-" && previous && "atom" in previous)) parts.push({ operator: ` ${char} ` });
    else parts.push({ operator: literal(char) });
  }
  let tex = "";
  let before: Part | undefined;
  for (const part of parts) {
    if ("operator" in part) tex += part.operator;
    else {
      // Zahl und Einheit stehen mit einem kleinen Abstand: 480 kcal.
      const gap = before && "atom" in before && before.atom.kind === "number" && part.atom.kind === "unit";
      tex += `${gap ? "\\," : part.space && tex && !tex.endsWith(" ") ? " " : ""}${part.atom.tex}`;
    }
    before = part;
  }
  return tex.replace(/ {2,}/g, " ").trim();
}

/** Ein Zeichen, das in LaTeX etwas Besonderes ist oder allein steht. */
function literal(char: string): string {
  switch (char) {
    case "{": case "}": case "%": case "&": case "#": return `\\${char}`;
    case "$": case "\\": return "";
    case ",": return "{,}";
    case "−": case "–": return "-";
    default: return char;
  }
}

/** Mathe und Physik: die einfache Schreibweise als LaTeX. Leer bleibt leer. */
export function toLatex(text: string): string {
  return parseSequence(new Reader(text), null);
}

/** Der mhchem-Eingabetext zur einfachen Schreibweise der Chemie: Pfeile und tiefgestellte Zeichen werden übersetzt. */
export function toChemistry(text: string): string {
  return text
    .replace(/[→⟶⟹]/g, "->")
    .replace(/[⇌⇄]/g, "<=>")
    .replace(/[₀-₉]/g, (char) => String(SUBSCRIPTS.indexOf(char)))
    .replace(new RegExp(`[${SUPERSCRIPTS}⁺⁻]+`, "g"), (run) => `^${[...run].map((char) => (char === "⁺" ? "+" : char === "⁻" ? "-" : SUPERSCRIPTS.indexOf(char))).join("")}`)
    .replace(/[$\\]/g, "")
    .trim();
}

/** Chemie: die einfache Schreibweise als LaTeX mit `\ce{…}`. Leer bleibt leer. */
export function chemistryToLatex(text: string): string {
  const chemistry = toChemistry(text);
  return chemistry ? `\\ce{${chemistry}}` : "";
}

/** Der Inhalt von `\ce{…}`, wenn die Quelle nur daraus besteht, sonst `null`. */
export function fromChemistry(latex: string): string | null {
  const match = /^\\ce\{([\s\S]*)\}$/.exec(latex.trim());
  if (!match) return null;
  let depth = 0;
  for (const char of match[1]!) {
    depth += char === "{" ? 1 : char === "}" ? -1 : 0;
    if (depth < 0) return null;
  }
  return depth === 0 ? match[1]!.trim() : null;
}

/** Befehle und was an ihre Stelle tritt; Operatoren mit Leerzeichen, damit der Text lesbar bleibt. */
const COMMANDS: [string, string][] = [
  ["\\rightleftharpoons", " <=> "], ["\\leftrightarrow", " <-> "], ["\\rightarrow", " -> "], ["\\to", " -> "], ["\\Rightarrow", " => "],
  ["\\leq", " <= "], ["\\le", " <= "], ["\\geq", " >= "], ["\\ge", " >= "], ["\\neq", " != "], ["\\ne", " != "], ["\\pm", " +- "],
  ["\\approx", " ~ "], ["\\cdot", " * "], ["\\times", " × "], ["\\div", " ÷ "], ["\\surd", "√"], ["\\%", "%"], ["\\&", "&"], ["\\#", "#"],
  ["\\{", "("], ["\\}", ")"], ["\\,", " "], ["\\;", " "], ["\\ ", " "], ["\\left", ""], ["\\right", ""],
  ...Object.entries(GREEK).map(([name, command]): [string, string] => [command, ` ${name} `]),
];

/**
 * LaTeX in die einfache Schreibweise von Mathe und Physik, soweit sie das ausdrücken kann; sonst `null`.
 * Die Übersetzung hin und zurück ist nicht in jedem Fall dieselbe Quelle; der Editor behält darum die ursprüngliche
 * Quelle, solange der Schüler den Text nicht ändert.
 */
export function fromLatex(latex: string): string | null {
  const plain = (value: string) => /^[\p{L}\p{N}.,]+$/u.test(value);
  const operand = (value: string) => (plain(value) ? value : `(${value})`);
  let text = latex.replaceAll("{,}", ",").replace(/\^\{\\circ\}/g, "°");
  for (let guard = 0; guard < 20 && /\\(?:frac|sqrt)/.test(text); guard++) {
    text = text
      .replace(/\\(?:mathrm|text)\{([^{}]*)\}/g, "$1")
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${operand(a)}/${operand(b)}`)
      .replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)");
  }
  text = text
    .replace(/\\(?:mathrm|text)\{([^{}]*)\}/g, "$1")
    .replace(/_\{([\p{L}\p{N}]+)\}/gu, "_$1")
    .replace(/_\{([^{}]*)\}/g, "_($1)")
    .replace(/\^\{([+-]?[\p{L}\p{N}]+)\}/gu, "^$1")
    .replace(/\^\{([^{}]*)\}/g, "^($1)");
  for (const [command, replacement] of [...COMMANDS].sort((a, b) => b[0].length - a[0].length)) {
    text = text.replaceAll(command, replacement);
  }
  if (/[\\{}]/.test(text)) return null;
  return text.replace(/ +([\^_])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/** Die Knöpfe unter dem Eingabefeld: was sie einfügen, und was auf dem Knopf steht. */
export interface FormulaSymbol {
  label: string;
  insert: string;
}

export const CHEMISTRY_SYMBOLS: FormulaSymbol[] = [
  { label: "→", insert: "->" }, { label: "⇌", insert: "<=>" },
  { label: "(aq)", insert: "(aq)" }, { label: "(s)", insert: "(s)" }, { label: "(l)", insert: "(l)" }, { label: "(g)", insert: "(g)" },
];

export const MATH_SYMBOLS: FormulaSymbol[] = ["²", "³", "₂", "√", "÷", "·", "×", "±", "°", "π", "→", "≤", "≥", "≠"]
  .map((symbol) => ({ label: symbol, insert: symbol }));

/** Die Quelle, die der Editor in dieser Weise aus dem Text macht. */
export function latexOf(mode: FormulaMode, text: string): string {
  if (mode === "chemistry") return chemistryToLatex(text);
  if (mode === "math") return toLatex(text);
  return text.trim();
}
