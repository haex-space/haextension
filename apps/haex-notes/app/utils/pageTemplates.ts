import type { PageTemplate } from "~/database/schemas";

export interface PageDimensions {
  width: number;
  height: number;
}

// A4 at 96 DPI (portrait)
export const PAGE_SIZE: PageDimensions = {
  width: 794,  // 210mm
  height: 1123, // 297mm
};

export const PAGE_SIZE_LANDSCAPE: PageDimensions = {
  width: 1123,
  height: 794,
};

export function getPageSize(orientation: string): PageDimensions {
  return orientation === "landscape" ? PAGE_SIZE_LANDSCAPE : PAGE_SIZE;
}

const MARGIN = { top: 60, bottom: 40, left: 50, right: 40 };

export const PAGE_TEMPLATES: { id: PageTemplate; i18n: { de: string; en: string } }[] = [
  { id: "blank", i18n: { de: "Blanko", en: "Blank" } },
  { id: "lined", i18n: { de: "Liniert", en: "Lined" } },
  { id: "grid", i18n: { de: "Kariert (5mm)", en: "Grid (5mm)" } },
  { id: "grid-large", i18n: { de: "Großkariert (10mm)", en: "Grid (10mm)" } },
  { id: "dotgrid", i18n: { de: "Punktraster", en: "Dot Grid" } },
  { id: "lineatur1", i18n: { de: "Lineatur 1 (Klasse 1)", en: "Lineature 1 (Grade 1)" } },
  { id: "lineatur2", i18n: { de: "Lineatur 2 (Klasse 2)", en: "Lineature 2 (Grade 2)" } },
  { id: "lineatur3", i18n: { de: "Lineatur 3 (Klasse 3)", en: "Lineature 3 (Grade 3)" } },
  { id: "music", i18n: { de: "Notenlinien", en: "Music Staff" } },
  { id: "millimeter", i18n: { de: "Millimeterpapier", en: "Millimeter Paper" } },
];

/**
 * Renders page template lines/grid onto a canvas context.
 * Context should already be translated to page origin.
 */
export function renderPageTemplate(
  ctx: CanvasRenderingContext2D,
  template: PageTemplate,
  width: number,
  height: number,
) {
  const lineColor = "rgba(150, 170, 200, 0.4)";
  const lineColorLight = "rgba(150, 170, 200, 0.2)";
  const lineColorStrong = "rgba(150, 170, 200, 0.6)";
  const dotColor = "rgba(150, 170, 200, 0.5)";
  const redLine = "rgba(220, 80, 80, 0.3)";

  ctx.save();

  switch (template) {
    case "lined": {
      const spacing = 30; // ~8mm at 96dpi
      // Red margin line
      ctx.strokeStyle = redLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, MARGIN.top);
      ctx.lineTo(MARGIN.left, height - MARGIN.bottom);
      ctx.stroke();

      // Horizontal lines
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;
      for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(MARGIN.left - 10, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();
      }
      break;
    }

    case "grid": {
      const spacing = 19; // ~5mm at 96dpi
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;
      for (let x = MARGIN.left; x <= width - MARGIN.right; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top);
        ctx.lineTo(x, height - MARGIN.bottom);
        ctx.stroke();
      }
      for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();
      }
      break;
    }

    case "grid-large": {
      const spacing = 38; // ~10mm at 96dpi
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;
      for (let x = MARGIN.left; x <= width - MARGIN.right; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top);
        ctx.lineTo(x, height - MARGIN.bottom);
        ctx.stroke();
      }
      for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();
      }
      break;
    }

    case "dotgrid": {
      const spacing = 19; // ~5mm
      ctx.fillStyle = dotColor;
      for (let x = MARGIN.left; x <= width - MARGIN.right; x += spacing) {
        for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }

    case "lineatur1": {
      // Schreiblern-Lineatur Klasse 1: Oberlinie, Mittellinie, Grundlinie, Unterlinie
      // Große Abstände für Erstklässler
      const bandHeight = 80; // Gesamthöhe einer Schreibzeile
      const oberH = bandHeight * 0.25;
      const mittelH = bandHeight * 0.25;
      const grundH = bandHeight * 0.25;
      const unterH = bandHeight * 0.25;

      ctx.lineWidth = 0.5;

      for (let y = MARGIN.top; y + bandHeight <= height - MARGIN.bottom; y += bandHeight + 15) {
        // Oberlinie (dünn, grau)
        ctx.strokeStyle = lineColorLight;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();

        // Mittellinie (gestrichelt, markiert Mittelhöhe für Kleinbuchstaben)
        ctx.strokeStyle = lineColor;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y + oberH);
        ctx.lineTo(width - MARGIN.right, y + oberH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Grundlinie (kräftig — hier stehen die Buchstaben)
        ctx.strokeStyle = lineColorStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y + oberH + mittelH);
        ctx.lineTo(width - MARGIN.right, y + oberH + mittelH);
        ctx.stroke();
        ctx.lineWidth = 0.5;

        // Unterlinie (dünn, für Unterlängen: g, p, y)
        ctx.strokeStyle = lineColorLight;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y + oberH + mittelH + grundH);
        ctx.lineTo(width - MARGIN.right, y + oberH + mittelH + grundH);
        ctx.stroke();
      }
      break;
    }

    case "lineatur2": {
      // Klasse 2: gleiche Struktur, etwas kleiner
      const bandHeight = 60;
      const oberH = bandHeight * 0.25;
      const mittelH = bandHeight * 0.25;
      const grundH = bandHeight * 0.25;

      ctx.lineWidth = 0.5;

      for (let y = MARGIN.top; y + bandHeight <= height - MARGIN.bottom; y += bandHeight + 10) {
        ctx.strokeStyle = lineColorLight;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();

        ctx.strokeStyle = lineColor;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y + oberH);
        ctx.lineTo(width - MARGIN.right, y + oberH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = lineColorStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y + oberH + mittelH);
        ctx.lineTo(width - MARGIN.right, y + oberH + mittelH);
        ctx.stroke();
        ctx.lineWidth = 0.5;

        ctx.strokeStyle = lineColorLight;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y + oberH + mittelH + grundH);
        ctx.lineTo(width - MARGIN.right, y + oberH + mittelH + grundH);
        ctx.stroke();
      }
      break;
    }

    case "lineatur3": {
      // Klasse 3: nur Grundlinie + Mittellinie, kein Oberlängenband
      const spacing = 30;

      ctx.lineWidth = 0.5;

      for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += spacing * 2) {
        // Mittellinie (gestrichelt)
        ctx.strokeStyle = lineColor;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Grundlinie (kräftig)
        ctx.strokeStyle = lineColorStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y + spacing);
        ctx.lineTo(width - MARGIN.right, y + spacing);
        ctx.stroke();
        ctx.lineWidth = 0.5;
      }
      break;
    }

    case "music": {
      const staffSpacing = 8; // Abstand zwischen den 5 Linien
      const staffHeight = staffSpacing * 4;
      const staffGap = 60; // Abstand zwischen Notensystemen

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;

      for (let y = MARGIN.top + 20; y + staffHeight <= height - MARGIN.bottom; y += staffHeight + staffGap) {
        for (let line = 0; line < 5; line++) {
          ctx.beginPath();
          ctx.moveTo(MARGIN.left, y + line * staffSpacing);
          ctx.lineTo(width - MARGIN.right, y + line * staffSpacing);
          ctx.stroke();
        }
      }
      break;
    }

    case "millimeter": {
      const mm1 = 3.78; // 1mm at 96dpi
      const mm5 = mm1 * 5;
      const mm10 = mm1 * 10;

      // 1mm lines (very light)
      ctx.strokeStyle = "rgba(150, 170, 200, 0.12)";
      ctx.lineWidth = 0.3;
      for (let x = MARGIN.left; x <= width - MARGIN.right; x += mm1) {
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top);
        ctx.lineTo(x, height - MARGIN.bottom);
        ctx.stroke();
      }
      for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += mm1) {
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();
      }

      // 5mm lines (medium)
      ctx.strokeStyle = lineColorLight;
      ctx.lineWidth = 0.5;
      for (let x = MARGIN.left; x <= width - MARGIN.right; x += mm5) {
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top);
        ctx.lineTo(x, height - MARGIN.bottom);
        ctx.stroke();
      }
      for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += mm5) {
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();
      }

      // 10mm lines (stronger)
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.8;
      for (let x = MARGIN.left; x <= width - MARGIN.right; x += mm10) {
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top);
        ctx.lineTo(x, height - MARGIN.bottom);
        ctx.stroke();
      }
      for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += mm10) {
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(width - MARGIN.right, y);
        ctx.stroke();
      }
      break;
    }

    case "blank":
    default:
      // Nothing to draw
      break;
  }

  ctx.restore();
}
