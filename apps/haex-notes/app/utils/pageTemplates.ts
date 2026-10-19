import type { PageTemplate } from "~/types/document";

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

/** Anzeigename einer Vorlage; unbekannte Ids (z.B. von neueren Versionen) bleiben stehen. */
export function templateLabel(template: string, locale: string): string {
  const entry = PAGE_TEMPLATES.find((t) => t.id === template);
  if (!entry) return template;
  return locale === "de" ? entry.i18n.de : entry.i18n.en;
}

/**
 * Vorlagen-Name einer gespeicherten Seite: bevorzugt das migrierte Modell, sonst
 * die Legacy-Spalte von Seiten, die noch nie im neuen Modell gespeichert wurden.
 */
export function pageTemplateLabel(
  page: { template: string; background: { template: string } | null },
  locale: string,
): string {
  return templateLabel(page.background?.template ?? page.template, locale);
}

const lineColor = "rgba(150, 170, 200, 0.4)";
const lineColorLight = "rgba(150, 170, 200, 0.2)";
const lineColorStrong = "rgba(150, 170, 200, 0.6)";
const dotColor = "rgba(150, 170, 200, 0.5)";
const redLine = "rgba(220, 80, 80, 0.3)";

function horizontalLine(ctx: CanvasRenderingContext2D, y: number, width: number) {
  ctx.beginPath();
  ctx.moveTo(MARGIN.left, y);
  ctx.lineTo(width - MARGIN.right, y);
  ctx.stroke();
}

/** Senkrechte und waagerechte Linien im Abstand `spacing` innerhalb der Ränder. */
function drawGrid(ctx: CanvasRenderingContext2D, spacing: number, width: number, height: number) {
  for (let x = MARGIN.left; x <= width - MARGIN.right; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, MARGIN.top);
    ctx.lineTo(x, height - MARGIN.bottom);
    ctx.stroke();
  }
  for (let y = MARGIN.top; y <= height - MARGIN.bottom; y += spacing) {
    horizontalLine(ctx, y, width);
  }
}

/**
 * Schreiblern-Lineatur: Ober-, Mittel-, Grund- und Unterlinie je Schreibzeile,
 * gleichmäßig über die Bandhöhe verteilt.
 */
function drawLineaturBands(
  ctx: CanvasRenderingContext2D,
  bandHeight: number,
  gap: number,
  width: number,
  height: number,
) {
  const step = bandHeight * 0.25;
  ctx.lineWidth = 0.5;

  for (let y = MARGIN.top; y + bandHeight <= height - MARGIN.bottom; y += bandHeight + gap) {
    // Oberlinie (dünn, grau)
    ctx.strokeStyle = lineColorLight;
    horizontalLine(ctx, y, width);

    // Mittellinie (gestrichelt, markiert Mittelhöhe für Kleinbuchstaben)
    ctx.strokeStyle = lineColor;
    ctx.setLineDash([4, 3]);
    horizontalLine(ctx, y + step, width);
    ctx.setLineDash([]);

    // Grundlinie (kräftig — hier stehen die Buchstaben)
    ctx.strokeStyle = lineColorStrong;
    ctx.lineWidth = 1;
    horizontalLine(ctx, y + step * 2, width);
    ctx.lineWidth = 0.5;

    // Unterlinie (dünn, für Unterlängen: g, p, y)
    ctx.strokeStyle = lineColorLight;
    horizontalLine(ctx, y + step * 3, width);
  }
}

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
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;
      drawGrid(ctx, 19, width, height); // ~5mm at 96dpi
      break;
    }

    case "grid-large": {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;
      drawGrid(ctx, 38, width, height); // ~10mm at 96dpi
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
      // Klasse 1: große Abstände für Erstklässler
      drawLineaturBands(ctx, 80, 15, width, height);
      break;
    }

    case "lineatur2": {
      // Klasse 2: gleiche Struktur, etwas kleiner
      drawLineaturBands(ctx, 60, 10, width, height);
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

      // 1mm lines (very light)
      ctx.strokeStyle = "rgba(150, 170, 200, 0.12)";
      ctx.lineWidth = 0.3;
      drawGrid(ctx, mm1, width, height);

      // 5mm lines (medium)
      ctx.strokeStyle = lineColorLight;
      ctx.lineWidth = 0.5;
      drawGrid(ctx, mm1 * 5, width, height);

      // 10mm lines (stronger)
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.8;
      drawGrid(ctx, mm1 * 10, width, height);
      break;
    }

    case "blank":
    default:
      // Nothing to draw
      break;
  }

  ctx.restore();
}
