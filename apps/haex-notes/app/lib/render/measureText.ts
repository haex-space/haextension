import type { TextElement } from "~/types/document";
import { measureTextHeight } from "./elements";

let context: CanvasRenderingContext2D | null = null;

/** Höhe eines Textblocks, so umbrochen, wie er gezeichnet wird; ohne Canvas gilt seine gespeicherte Höhe. */
export function textHeightOf(text: TextElement): number {
  context ??= document.createElement("canvas").getContext("2d");
  return context ? measureTextHeight(context, text) : text.height;
}
