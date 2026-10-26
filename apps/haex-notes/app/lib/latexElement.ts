import type { LatexElement } from "~/types/document";
import { computeBbox } from "./bbox";
import type { Rendered } from "./math";

/** Die Tinte einer neuen Formel, wie die eines erkannten Textes. */
export const FORMULA_INK = "#1f2937";

/**
 * Ein Formel-Element aus einer gesetzten Formel: `em` ist die Schriftgröße in Seitenpixeln, in der sie steht.
 * Mit `maxWidth` wird sie verkleinert, wenn sie sonst breiter wäre; vergrößert wird sie dadurch nie.
 */
export function latexElementOf(
  id: string,
  source: string,
  rendered: Rendered,
  at: { x: number; y: number },
  em: number,
  options: { maxWidth?: number; color?: string } = {},
): LatexElement {
  const shrink = options.maxWidth ? Math.min(1, options.maxWidth / (rendered.width * em)) : 1;
  const element: LatexElement = {
    id, type: "latex", x: at.x, y: at.y,
    width: rendered.width * em * shrink, height: rendered.height * em * shrink, rotation: 0,
    source, svg: rendered.svg, color: options.color ?? FORMULA_INK, bbox: [0, 0, 0, 0],
  };
  element.bbox = computeBbox(element);
  return element;
}
