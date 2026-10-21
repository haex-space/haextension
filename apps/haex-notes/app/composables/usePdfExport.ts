import type { PageDoc } from "~/lib/commands";
import { buildPdfAsync, exportLayers, JPEG_QUALITY, RASTER_SCALE, type PdfSettings } from "~/lib/paperNotes/exportPdf";
import { loadHandwritingFontsAsync } from "~/lib/paperNotes/fonts";
import { originalLayerId } from "~/lib/paperNotes/views";
import { drawElements, type ImageLookup } from "~/lib/render/elements";
import type { ImageSource, PageElement } from "~/types/document";
import { renderPageTemplate } from "~/utils/pageTemplates";
import { imageSourceKey } from "./useElementImages";

const canvasOf = (width: number, height: number, scale: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[haex-notes] No 2D canvas for the PDF export");
  ctx.scale(scale, scale);
  return { canvas, ctx };
};

const sourcesOf = (elements: PageElement[]) =>
  elements.flatMap((element) => (element.type === "image" ? [element.source] : []));

/**
 * Exportiert die geöffnete Seite als PDF (US4 in haex-space/haex-vault@d91e91721e4aca4e926fb6c32152c79f317b2d52:specs/046-paper-notes-canvas/spec.md):
 * erst alle Bilder und Handschriften laden, dann die Seite so rastern, wie der Canvas sie zeigt,
 * und die PDF über den Speichern-Dialog von holzi ablegen.
 */
export function usePdfExport() {
  const assetStore = useAssetStore();
  const haexVault = useHaexVaultStore();

  /** Anders als auf dem Bildschirm wird erst gezeichnet, wenn alle Bilder da sind. */
  async function loadImagesAsync(sources: ImageSource[]): Promise<{ lookup: ImageLookup; release: () => void }> {
    const images = new Map<string, HTMLImageElement>();
    const urls: string[] = [];
    await Promise.all(sources.map(async (source) => {
      const key = imageSourceKey(source);
      if (images.has(key)) return;
      let src = source.kind === "inline" ? source.dataUrl : null;
      if (source.kind === "asset") {
        const [bytes, meta] = await Promise.all([assetStore.readAsync(source.assetId), assetStore.metaAsync(source.assetId)]);
        if (!bytes || !meta) return;
        src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: meta.mimeType }));
        urls.push(src);
      }
      const image = new Image();
      image.src = src!;
      try {
        await image.decode();
        images.set(key, image);
      } catch {
        // Ein Bild, das sich nicht dekodieren lässt, bleibt wie auf dem Bildschirm ein Platzhalter.
      }
    }));
    return {
      lookup: (source) => images.get(imageSourceKey(source)) ?? null,
      release: () => { for (const url of urls) URL.revokeObjectURL(url); },
    };
  }

  async function rasterAsync(doc: PageDoc, elements: PageElement[], settings: PdfSettings): Promise<Uint8Array> {
    const scale = RASTER_SCALE[settings.quality];
    const overlay = doc.background.overlay?.type === "image" ? doc.background.overlay : null;
    const images = await loadImagesAsync([...sourcesOf(elements), ...(overlay ? [overlay.source] : [])]);
    try {
      const page = canvasOf(doc.width, doc.height, scale);
      page.ctx.fillStyle = doc.background.paperColor;
      page.ctx.fillRect(0, 0, doc.width, doc.height);
      renderPageTemplate(page.ctx, doc.background.template, doc.width, doc.height);
      const overlayImage = overlay ? images.lookup(overlay.source) : null;
      if (overlay && overlayImage) {
        page.ctx.globalAlpha = overlay.opacity;
        page.ctx.drawImage(overlayImage, 0, 0, doc.width, doc.height);
        page.ctx.globalAlpha = 1;
      }
      // Eigener Canvas wie auf dem Bildschirm: der Radierer stanzt Striche aus, nicht das Papier.
      const content = canvasOf(doc.width, doc.height, scale);
      drawElements(content.ctx, elements, undefined, images.lookup);
      page.ctx.drawImage(content.canvas, 0, 0, doc.width, doc.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        page.canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY[settings.quality]));
      if (!blob) throw new Error("[haex-notes] The page could not be rastered for the PDF");
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      images.release();
    }
  }

  /** false, wenn der Schüler den Speichern-Dialog abbricht. */
  async function exportPageAsync(doc: PageDoc, settings: PdfSettings, fileName: string, dialogTitle: string): Promise<boolean> {
    await loadHandwritingFontsAsync(document.baseURI);
    const originalId = doc.paperImport ? originalLayerId(doc.layers, doc.paperImport) : null;
    const elements = exportLayers(doc.layers, originalId, settings.showOriginal).flatMap((layer) => layer.elements);
    const jpeg = await rasterAsync(doc, elements, settings);
    const pdf = await buildPdfAsync([{ size: doc, jpeg }], settings);
    const saved = await haexVault.client.filesystem.saveFileAsync(pdf, {
      defaultPath: `${fileName}.pdf`,
      title: dialogTitle,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    return saved !== null;
  }

  return { exportPageAsync };
}
