import type { BrushPreset } from "~/types";
import { BRUSH_PRESETS } from "~/utils/brushPresets";

export function useBrushPresets() {
  const getPreset = (id: string): BrushPreset => {
    return BRUSH_PRESETS.find((p) => p.id === id) ?? BRUSH_PRESETS[0];
  };

  return { presets: BRUSH_PRESETS, getPreset };
}
