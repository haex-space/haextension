export type EditorTool = "crop" | "rotate" | "resize" | "adjust" | "filter" | "compress";

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

export interface HistoryEntry {
  /** Encoded image: the opened file itself, or what an edit encoded. */
  blob: Blob;
  width: number;
  height: number;
}

export type FilterType ="none" | "grayscale" | "sepia" | "invert" | "warm" | "cool" | "vintage";

export interface AspectRatioPreset {
  id: string;
  label: string;
  ratio: number | null; // null = free
}
