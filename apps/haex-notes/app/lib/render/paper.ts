import type { PageBackground } from "~/types/document";
import { renderPageTemplate } from "~/utils/pageTemplates";

/** Papier, Vorlage und Bild-Overlay einer Seite; Bildschirm, Vorschau und PDF zeichnen sie gleich. */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  background: PageBackground,
  width: number,
  height: number,
  overlayImage: CanvasImageSource | null = null,
) {
  ctx.fillStyle = background.paperColor;
  ctx.fillRect(0, 0, width, height);
  renderPageTemplate(ctx, background.template, width, height);
  const overlay = background.overlay;
  if (overlay?.type === "image" && overlayImage) {
    ctx.save();
    ctx.globalAlpha = overlay.opacity;
    ctx.drawImage(overlayImage, 0, 0, width, height);
    ctx.restore();
  }
}
