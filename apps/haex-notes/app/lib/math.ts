/**
 * Gesetzte Formeln (holzi Spec 046, FR-029 bis FR-033): LaTeX wird mit MathJax zu einem SVG gesetzt, mit der
 * Chemie-Erweiterung `\ce{…}` für Reaktionsgleichungen. MathJax ist groß und wird erst geladen, wenn eine Seite
 * eine Formel braucht; danach setzt `renderLatex` ohne Wartezeit.
 *
 * Ein SVG nutzt `currentColor`; `paint` färbt es mit der Tinte des Elements und gibt ihm eine Größe in Pixeln.
 */

/** Ein gesetztes SVG mit seiner Größe in `em` (1 em = die Schriftgröße, in der gesetzt wurde). */
export interface Rendered {
  svg: string;
  width: number;
  height: number;
}

export type MathResult = Rendered | { error: string };

interface Engine {
  convert(source: string): string;
}

let engine: Engine | null = null;
let loading: Promise<Engine> | null = null;

async function createEngine(): Promise<Engine> {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] = await Promise.all([
    import("mathjax-full/js/mathjax.js"),
    import("mathjax-full/js/input/tex.js"),
    import("mathjax-full/js/output/svg.js"),
    import("mathjax-full/js/adaptors/liteAdaptor.js"),
    import("mathjax-full/js/handlers/html.js"),
    import("mathjax-full/js/input/tex/base/BaseConfiguration.js"),
    import("mathjax-full/js/input/tex/ams/AmsConfiguration.js"),
    import("mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js"),
  ]);
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  // Ein Fehler wird geworfen statt als rotes Wort in die Formel gesetzt: Der Aufrufer entscheidet, was der Schüler sieht.
  const input = new TeX({
    packages: ["base", "ams", "mhchem"],
    formatError: (_jax: unknown, error: Error) => {
      throw error;
    },
  });
  const html = mathjax.document("", { InputJax: input, OutputJax: new SVG({ fontCache: "none" }) });
  return {
    convert(source) {
      const node = html.convert(source, { display: false, em: 16, ex: 8, containerWidth: 1280 });
      return adaptor.outerHTML(adaptor.firstChild(node) as never);
    },
  };
}

/** Lädt MathJax einmal; wer es braucht, wartet hierauf und setzt danach mit `renderLatex`. */
export function loadMathAsync(): Promise<void> {
  loading ??= createEngine().then((loaded) => {
    engine = loaded;
    return loaded;
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading.then(() => undefined);
}

/** Ob MathJax geladen ist und `renderLatex` setzen kann. */
export const isMathLoaded = () => engine !== null;

/** Größe des SVG in `em`, aus seiner `viewBox` (MathJax rechnet in Tausendstel `em`). */
export function sizeOf(svg: string): { width: number; height: number } | null {
  const match = /viewBox="\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (!match) return null;
  const width = Number(match[3]) / 1000;
  const height = Number(match[4]) / 1000;
  return width > 0 && height > 0 ? { width, height } : null;
}

/** MathJax wirft eigene Fehlerobjekte, die keine `Error` sind, aber eine `message` haben. */
function message(error: unknown): string {
  const text = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  return text.trim() || "invalid LaTeX";
}

/**
 * Setzt LaTeX zu einem SVG. Ein Fehler (unbekannter Befehl, fehlende Klammer, leere Quelle) kommt als
 * `{ error }` zurück und wirft nicht. MathJax muss geladen sein (`loadMathAsync`).
 */
export function renderLatex(source: string): MathResult {
  if (!engine) return { error: "MathJax is not loaded" };
  if (!source.trim()) return { error: "empty" };
  try {
    const svg = engine.convert(source);
    const size = sizeOf(svg);
    return size ? { svg, ...size } : { error: "the formula has no size" };
  } catch (error) {
    return { error: message(error) };
  }
}

/** Lädt MathJax, wenn nötig, und setzt dann. */
export async function renderLatexAsync(source: string): Promise<MathResult> {
  await loadMathAsync();
  return renderLatex(source);
}

/** Das SVG in der Tintenfarbe und mit einer Größe in Pixeln, damit ein Bild es ohne MathJax zeichnen kann. */
export function paint(svg: string, color: string, widthPx: number, heightPx: number): string {
  const sized = svg.replace(/^<svg([^>]*)>/, (_, attributes: string) => {
    const rest = attributes.replace(/\s(width|height)="[^"]*"/g, "");
    return `<svg${rest} width="${widthPx}" height="${heightPx}">`;
  });
  return sized.replaceAll("currentColor", color);
}

/** Eine Data-URL für ein SVG, wie die Bildablage des Renderers sie als Quelle nimmt. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Ob eine Tabellenzelle nur eine Formel ist (`$…$`); deren Quelle ohne die Zeichen, sonst `null`. */
export function formulaOfCell(cell: string): string | null {
  const match = /^\s*\$([^$]+)\$\s*$/.exec(cell);
  return match ? match[1]!.trim() : null;
}

/** Pixel je `em`, in denen eine Formel zum Bild gesetzt wird; gezeichnet wird skaliert, es bleibt scharf. */
export const FORMULA_EM_PX = 16;

/**
 * Die Data-URL des gesetzten Bildes einer Formel in einer Tintenfarbe, oder `null`, wenn sich die Quelle nicht
 * setzen lässt. Lädt MathJax, wenn nötig.
 */
export async function formulaImageUrlAsync(source: string, color: string): Promise<string | null> {
  const result = await renderLatexAsync(source);
  if ("error" in result) return null;
  return svgDataUrl(paint(result.svg, color, result.width * FORMULA_EM_PX, result.height * FORMULA_EM_PX));
}
