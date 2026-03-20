import { STENCIL_PRESETS } from "~/utils/stencilPresets";

export function useStencilPresets() {
  const getPreset = (id: string) => STENCIL_PRESETS.find((p) => p.id === id);

  const dinPresets = STENCIL_PRESETS.filter((p) => p.category === "din");
  const geometricPresets = STENCIL_PRESETS.filter((p) => p.category === "geometric");
  const socialPresets = STENCIL_PRESETS.filter((p) => p.category === "social");
  const adsPresets = STENCIL_PRESETS.filter((p) => p.category === "ads");
  const screenPresets = STENCIL_PRESETS.filter((p) => p.category === "screens");

  return { presets: STENCIL_PRESETS, dinPresets, geometricPresets, socialPresets, adsPresets, screenPresets, getPreset };
}
