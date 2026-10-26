import { PDFDocument } from "pdf-lib";
import type { PageLayer } from "~/types/document";

/**
 * PDF-Export (US4 in haex-space/haex-vault@d91e91721e4aca4e926fb6c32152c79f317b2d52:specs/046-paper-notes-canvas/spec.md):
 * die sichtbare Seite wird gerastert und als Bild in eine PDF-Seite gelegt (research R6). Hier
 * stehen Platzierung, Ebenenwahl und der Bau der PDF; das Rastern braucht einen Canvas und
 * liegt im Composable.
 */

export type PaperSize = "auto" | "a4" | "letter";
export type Orientation = "auto" | "portrait" | "landscape";
export type Quality = "high" | "medium" | "low";

export interface PdfSettings {
  paper: PaperSize;
  orientation: Orientation;
  marginMm: number;
  quality: Quality;
}

/** Voreinstellungen aus plan.md. */
export const defaultPdfSettings = (): PdfSettings => ({
  paper: "auto", orientation: "auto", marginMm: 0, quality: "high",
});

/** Pixel je Seiteneinheit (CSS-Pixel bei 96 dpi): 288, 192 und 96 dpi. */
export const RASTER_SCALE: Record<Quality, number> = { high: 3, medium: 2, low: 1 };
export const PDF_JPEG_QUALITY: Record<Quality, number> = { high: 0.92, medium: 0.85, low: 0.75 };

/** Mehr Rand ließe auf A4 kaum noch Seite übrig. */
export const MAX_MARGIN_MM = 50;

/** Der Rand, der wirklich gilt; ein leeres oder ungültiges Feld zählt als kein Rand. */
export const clampMarginMm = (value: unknown) => Math.min(Math.max(0, Number(value) || 0), MAX_MARGIN_MM);

const PT_PER_PX = 72 / 96;
const PT_PER_MM = 72 / 25.4;
const PAPER_PT: Record<Exclude<PaperSize, "auto">, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

/** Größe der PDF-Seite und Lage des Seitenbilds darauf, in Punkt. */
export interface PdfPlacement {
  width: number;
  height: number;
  x: number;
  y: number;
  drawWidth: number;
  drawHeight: number;
}

export function placePage(page: { width: number; height: number }, settings: PdfSettings): PdfPlacement {
  let [width, height] = settings.paper === "auto"
    ? [page.width * PT_PER_PX, page.height * PT_PER_PX]
    : PAPER_PT[settings.paper];
  const landscape = settings.orientation === "auto" ? page.width > page.height : settings.orientation === "landscape";
  if (landscape !== width > height) [width, height] = [height, width];

  const margin = clampMarginMm(settings.marginMm) * PT_PER_MM;
  const scale = Math.min((width - 2 * margin) / page.width, (height - 2 * margin) / page.height);
  const drawWidth = page.width * scale;
  const drawHeight = page.height * scale;
  return { width, height, x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, drawWidth, drawHeight };
}

/** Die Ebenen im PDF: die sichtbaren. Anhänge gehören nicht hinein (FR-026). */
export function exportLayers(layers: readonly PageLayer[]): PageLayer[] {
  return layers.filter((layer) => layer.visible);
}

/** Eine PDF-Seite je Notizseite, jede mit ihrem gerasterten Bild. */
export async function buildPdfAsync(
  pages: readonly { size: { width: number; height: number }; jpeg: Uint8Array }[],
  settings: PdfSettings,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const { size, jpeg } of pages) {
    const placed = placePage(size, settings);
    const pdfPage = pdf.addPage([placed.width, placed.height]);
    const image = await pdf.embedJpg(jpeg);
    pdfPage.drawImage(image, { x: placed.x, y: placed.y, width: placed.drawWidth, height: placed.drawHeight });
  }
  return pdf.save();
}
