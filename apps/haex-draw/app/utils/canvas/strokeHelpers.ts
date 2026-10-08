import type { StrokeData } from "~/database/schemas";
import type { BrushPreset } from "~/types";
import { BRUSH_PRESETS } from "~/utils/brushPresets";

// Seeded random for consistent texture per stroke
export function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function getSvgPathFromStroke(stroke: [number, number][]) {
  if (stroke.length < 2) return "";

  const d: string[] = [];
  const first = stroke[0]!;
  d.push(`M ${first[0]} ${first[1]}`);

  for (let i = 1; i < stroke.length; i++) {
    const pt = stroke[i]!;
    if (i === 1) {
      d.push(`L ${pt[0]} ${pt[1]}`);
    } else {
      const prev = stroke[i - 1]!;
      const cpX = (prev[0] + pt[0]) / 2;
      const cpY = (prev[1] + pt[1]) / 2;
      d.push(`Q ${prev[0]} ${prev[1]} ${cpX} ${cpY}`);
    }
  }

  d.push("Z");
  return d.join(" ");
}

export function getPreset(presetId?: string): BrushPreset {
  return BRUSH_PRESETS.find((p) => p.id === presetId) ?? BRUSH_PRESETS[0]!;
}

/** Get the centerline of a stroke (average of input points, smoothed) */
export function getCenterline(points: [number, number, number][]): [number, number, number][] {
  return points;
}

/** Returns the effective fill color — white for eraser presets, otherwise the stroke color */
export function getStrokeColor(stroke: StrokeData, preset: BrushPreset): string {
  return preset.isEraser ? "#ffffff" : stroke.color;
}
