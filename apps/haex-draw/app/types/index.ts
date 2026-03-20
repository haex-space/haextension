export type Tool = "brush" | "eraser" | "pan" | "stencil";

/** Brush tip shape — affects cross-section of the stroke */
export type BrushTip = "round" | "flat" | "chisel";

export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export type BrushRenderMode = "fill" | "stroke" | "dots" | "dashed" | "multi-stroke" | "textured" | "watercolor" | "chalk" | "spray";

export interface BrushPreset {
  id: string;
  icon: string; // lucide icon name
  i18n: { de: string; en: string };
  renderMode: BrushRenderMode;
  /** Opacity multiplier 0-1 (for marker, watercolor, etc.) */
  opacity?: number;
  /** Line cap style for stroke-mode brushes */
  lineCap?: CanvasLineCap;
  /** Line join style for stroke-mode brushes */
  lineJoin?: CanvasLineJoin;
  /** Dash pattern for dashed mode [dash, gap] */
  dashPattern?: number[];
  /** For multi-stroke: number of parallel lines */
  multiStrokeCount?: number;
  /** For multi-stroke: spread between lines in px */
  multiStrokeSpread?: number;
  /** For dots: density (dots per point) */
  dotDensity?: number;
  /** For dots: radius range [min, max] as factor of size */
  dotRadiusRange?: [number, number];
  /** For textured: jitter amount (randomness) */
  jitter?: number;
  /** If true, this preset paints with the background color (eraser) */
  isEraser?: boolean;
  options: {
    thinning: number;
    smoothing: number;
    streamline: number;
    simulatePressure: boolean;
    start?: { taper: number | boolean; cap: boolean };
    end?: { taper: number | boolean; cap: boolean };
  };
}
