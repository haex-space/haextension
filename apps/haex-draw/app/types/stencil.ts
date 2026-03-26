export type StencilShapeType = "rectangle" | "circle" | "ellipse" | "star" | "triangle" | "heart" | "hexagon" | "custom" | "image" | "emoji";

export interface StencilPreset {
  id: string;
  category: "din" | "geometric" | "social" | "ads" | "screens" | "custom" | "emoji";
  shapeType: StencilShapeType;
  /** Emoji character for emoji stencils */
  emoji?: string;
  i18n: { de: string; en: string };
  /** Default width/height in world-space pixels */
  defaultWidth: number;
  defaultHeight: number;
}

export interface Stencil {
  id: string;
  presetId: string;
  shapeType: StencilShapeType;
  label: string;
  /** Center position in world coordinates */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in radians */
  rotation: number;
  /** Locked in place — cannot be dragged */
  pinned: boolean;
  /** SVG path data for custom shapes */
  svgPath?: string;
  /** Base64 image data for image stencils */
  imageData?: string;
  /** Emoji character for emoji stencils */
  emoji?: string;
  /** Layer order (higher = rendered later = on top) */
  zIndex?: number;
  /** Opacity 0-1 (default: 1) */
  opacity?: number;
  /** Saturation multiplier (default: 1, 0 = grayscale, 2 = oversaturated) */
  saturation?: number;
  /** Brightness multiplier (default: 1, 0 = black, 2 = bright) */
  brightness?: number;
  /** Contrast multiplier (default: 1) */
  contrast?: number;
}
