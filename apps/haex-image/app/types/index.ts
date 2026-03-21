export type EditorTool = "crop" | "rotate" | "resize" | "adjust" | "filter";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageAdjustments {
  brightness: number;  // -100 to 100
  contrast: number;    // -100 to 100
  saturation: number;  // -100 to 100
}

export type FilterType = "none" | "grayscale" | "sepia" | "invert" | "warm" | "cool" | "vintage";

export interface AspectRatioPreset {
  id: string;
  label: string;
  ratio: number | null; // null = free
}
