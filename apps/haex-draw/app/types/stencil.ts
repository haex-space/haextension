export type StencilShapeType = "rectangle" | "circle" | "ellipse" | "star" | "triangle" | "heart" | "hexagon" | "custom";

export interface StencilPreset {
  id: string;
  category: "din" | "geometric" | "social" | "ads" | "screens" | "custom";
  shapeType: StencilShapeType;
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
}
