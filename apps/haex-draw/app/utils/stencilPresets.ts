import type { StencilPreset } from "~/types/stencil";

// DIN formats at 96 DPI (1mm ≈ 3.78px)
const MM_TO_PX = 3.78;

export const STENCIL_PRESETS: StencilPreset[] = [
  {
    id: "din-a5",
    category: "din",
    shapeType: "rectangle",
    i18n: { de: "DIN A5", en: "DIN A5" },
    defaultWidth: Math.round(210 * MM_TO_PX),
    defaultHeight: Math.round(148 * MM_TO_PX),
  },
  {
    id: "din-a4",
    category: "din",
    shapeType: "rectangle",
    i18n: { de: "DIN A4", en: "DIN A4" },
    defaultWidth: Math.round(297 * MM_TO_PX),
    defaultHeight: Math.round(210 * MM_TO_PX),
  },
  {
    id: "din-a3",
    category: "din",
    shapeType: "rectangle",
    i18n: { de: "DIN A3", en: "DIN A3" },
    defaultWidth: Math.round(420 * MM_TO_PX),
    defaultHeight: Math.round(297 * MM_TO_PX),
  },
  {
    id: "din-a2",
    category: "din",
    shapeType: "rectangle",
    i18n: { de: "DIN A2", en: "DIN A2" },
    defaultWidth: Math.round(594 * MM_TO_PX),
    defaultHeight: Math.round(420 * MM_TO_PX),
  },
  {
    id: "circle",
    category: "geometric",
    shapeType: "circle",
    i18n: { de: "Kreis", en: "Circle" },
    defaultWidth: 60,
    defaultHeight: 60,
  },
  {
    id: "star",
    category: "geometric",
    shapeType: "star",
    i18n: { de: "Stern", en: "Star" },
    defaultWidth: 60,
    defaultHeight: 60,
  },
  {
    id: "triangle",
    category: "geometric",
    shapeType: "triangle",
    i18n: { de: "Dreieck", en: "Triangle" },
    defaultWidth: 60,
    defaultHeight: 52,
  },
  {
    id: "heart",
    category: "geometric",
    shapeType: "heart",
    i18n: { de: "Herz", en: "Heart" },
    defaultWidth: 60,
    defaultHeight: 54,
  },
  {
    id: "hexagon",
    category: "geometric",
    shapeType: "hexagon",
    i18n: { de: "Sechseck", en: "Hexagon" },
    defaultWidth: 60,
    defaultHeight: 52,
  },

  // Social Media
  {
    id: "social-facebook",
    category: "social",
    shapeType: "rectangle",
    i18n: { de: "Facebook Post (1200×630)", en: "Facebook Post (1200×630)" },
    defaultWidth: 1200,
    defaultHeight: 630,
  },
  {
    id: "social-instagram",
    category: "social",
    shapeType: "rectangle",
    i18n: { de: "Instagram Post (1080×1080)", en: "Instagram Post (1080×1080)" },
    defaultWidth: 1080,
    defaultHeight: 1080,
  },
  {
    id: "social-instagram-story",
    category: "social",
    shapeType: "rectangle",
    i18n: { de: "Instagram Story (1080×1920)", en: "Instagram Story (1080×1920)" },
    defaultWidth: 1080,
    defaultHeight: 1920,
  },
  {
    id: "social-twitter",
    category: "social",
    shapeType: "rectangle",
    i18n: { de: "X / Twitter (1600×900)", en: "X / Twitter (1600×900)" },
    defaultWidth: 1600,
    defaultHeight: 900,
  },
  {
    id: "social-youtube-thumb",
    category: "social",
    shapeType: "rectangle",
    i18n: { de: "YouTube Thumbnail (1280×720)", en: "YouTube Thumbnail (1280×720)" },
    defaultWidth: 1280,
    defaultHeight: 720,
  },
  {
    id: "social-linkedin",
    category: "social",
    shapeType: "rectangle",
    i18n: { de: "LinkedIn Post (1200×627)", en: "LinkedIn Post (1200×627)" },
    defaultWidth: 1200,
    defaultHeight: 627,
  },

  // Digital Ads
  {
    id: "ads-leaderboard",
    category: "ads",
    shapeType: "rectangle",
    i18n: { de: "Bestenliste (728×90)", en: "Leaderboard (728×90)" },
    defaultWidth: 728,
    defaultHeight: 90,
  },
  {
    id: "ads-medium-rect",
    category: "ads",
    shapeType: "rectangle",
    i18n: { de: "Mittleres Rechteck (300×250)", en: "Medium Rectangle (300×250)" },
    defaultWidth: 300,
    defaultHeight: 250,
  },
  {
    id: "ads-wide-sky",
    category: "ads",
    shapeType: "rectangle",
    i18n: { de: "Breiter Wolkenkratzer (160×600)", en: "Wide Skyscraper (160×600)" },
    defaultWidth: 160,
    defaultHeight: 600,
  },
  {
    id: "ads-banner",
    category: "ads",
    shapeType: "rectangle",
    i18n: { de: "Banner (468×60)", en: "Banner (468×60)" },
    defaultWidth: 468,
    defaultHeight: 60,
  },

  // Screen Resolutions
  {
    id: "screen-hd",
    category: "screens",
    shapeType: "rectangle",
    i18n: { de: "HD (1280×720)", en: "HD (1280×720)" },
    defaultWidth: 1280,
    defaultHeight: 720,
  },
  {
    id: "screen-fhd",
    category: "screens",
    shapeType: "rectangle",
    i18n: { de: "Full HD (1920×1080)", en: "Full HD (1920×1080)" },
    defaultWidth: 1920,
    defaultHeight: 1080,
  },
  {
    id: "screen-2k",
    category: "screens",
    shapeType: "rectangle",
    i18n: { de: "2K (2560×1440)", en: "2K (2560×1440)" },
    defaultWidth: 2560,
    defaultHeight: 1440,
  },
  {
    id: "screen-4k",
    category: "screens",
    shapeType: "rectangle",
    i18n: { de: "4K (3840×2160)", en: "4K (3840×2160)" },
    defaultWidth: 3840,
    defaultHeight: 2160,
  },
];

/**
 * Returns a Path2D clip path for a given stencil shape,
 * centered at (0, 0) with the given half-width and half-height.
 */
export function getStencilClipPath(shapeType: string, hw: number, hh: number, svgPath?: string): Path2D {
  const path = new Path2D();

  switch (shapeType) {
    case "custom": {
      if (!svgPath) {
        path.rect(-hw, -hh, hw * 2, hh * 2);
        break;
      }
      // SVG path data is in original coordinates (0,0 = top-left).
      // Translate to center the shape at origin.
      const svgP = new Path2D(svgPath);
      const centered = new Path2D();
      centered.addPath(svgP, new DOMMatrix().translate(-hw, -hh));
      return centered;
    }

    case "rectangle":
      path.rect(-hw, -hh, hw * 2, hh * 2);
      break;

    case "circle":
      path.ellipse(0, 0, Math.min(hw, hh), Math.min(hw, hh), 0, 0, Math.PI * 2);
      break;

    case "ellipse":
      path.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      break;

    case "star": {
      const spikes = 5;
      const outerR = Math.min(hw, hh);
      const innerR = outerR * 0.38;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI * i) / spikes - Math.PI / 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();
      break;
    }

    case "triangle": {
      const r = Math.min(hw, hh);
      path.moveTo(0, -r);
      path.lineTo(r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6));
      path.lineTo(-r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6));
      path.closePath();
      break;
    }

    case "heart": {
      const w = hw;
      const h = hh;
      path.moveTo(0, -h * 0.4);
      path.bezierCurveTo(w * 0.5, -h, w, -h * 0.4, 0, h * 0.6);
      path.moveTo(0, -h * 0.4);
      path.bezierCurveTo(-w * 0.5, -h, -w, -h * 0.4, 0, h * 0.6);
      path.closePath();
      break;
    }

    case "hexagon": {
      const r = Math.min(hw, hh);
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 3 - Math.PI / 6;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();
      break;
    }

    default:
      path.rect(-hw, -hh, hw * 2, hh * 2);
  }

  return path;
}
