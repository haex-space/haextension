import type { FilterType, ImageAdjustments } from "~/types";

export type Rgb = [number, number, number];

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function hasAdjustments(adjustments: ImageAdjustments): boolean {
  return adjustments.brightness !== 0 || adjustments.contrast !== 0 || adjustments.saturation !== 0;
}

/** Brightness, then contrast, then saturation; values outside 0–255 are clamped by `mapPixels`. */
export function adjustmentsPixelFn(adjustments: ImageAdjustments): (r: number, g: number, b: number) => Rgb {
  const br = adjustments.brightness * 2.55;
  const co = 1 + adjustments.contrast / 100;
  const sat = 1 + adjustments.saturation / 100;
  return (r, g, b) => {
    r += br; g += br; b += br;
    r = ((r / 255 - 0.5) * co + 0.5) * 255;
    g = ((g / 255 - 0.5) * co + 0.5) * 255;
    b = ((b / 255 - 0.5) * co + 0.5) * 255;
    const gray = luminance(r, g, b);
    return [gray + (r - gray) * sat, gray + (g - gray) * sat, gray + (b - gray) * sat];
  };
}

export function filterPixel(filter: FilterType, r: number, g: number, b: number): Rgb {
  switch (filter) {
    case "grayscale": {
      const gray = luminance(r, g, b);
      return [gray, gray, gray];
    }
    case "sepia":
      return [r * 0.393 + g * 0.769 + b * 0.189, r * 0.349 + g * 0.686 + b * 0.168, r * 0.272 + g * 0.534 + b * 0.131];
    case "invert":
      return [255 - r, 255 - g, 255 - b];
    case "warm":
      return [Math.min(255, r * 1.1 + 10), g, Math.max(0, b * 0.9 - 5)];
    case "cool":
      return [Math.max(0, r * 0.9 - 5), g, Math.min(255, b * 1.1 + 10)];
    case "vintage": {
      const gray = luminance(r, g, b);
      return [(gray * 0.6 + r * 0.4 + 20) * 0.95, (gray * 0.5 + g * 0.5 + 5) * 0.9, (gray * 0.6 + b * 0.4 - 10) * 0.85];
    }
    case "none":
      return [r, g, b];
  }
}

/** Applies `fn` to every pixel of the context's top-left `w`×`h` area, clamping to 0–255; alpha is kept. */
export function mapPixels(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (r: number, g: number, b: number) => Rgb) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = fn(d[i]!, d[i + 1]!, d[i + 2]!);
    d[i] = Math.max(0, Math.min(255, r));
    d[i + 1] = Math.max(0, Math.min(255, g));
    d[i + 2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(imageData, 0, 0);
}
