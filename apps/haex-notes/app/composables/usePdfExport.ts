import type { PageDoc } from "~/lib/commands";
import { buildPdfAsync, exportLayers, PDF_JPEG_QUALITY, RASTER_SCALE, type PdfSettings } from "~/lib/paperNotes/exportPdf";
import { loadHandwritingFontsAsync } from "~/lib/paperNotes/fonts";
import { canvas, jpegBytesAsync } from "~/lib/paperNotes/workingCopy";
import { formulaOfCell, formulaImageUrlAsync } from "~/lib/math";
import { CELL_INK, drawElements, latexImageSource, type FormulaSource, type ImageLookup, type RenderSource } from "~/lib/render/elements";
import { drawPaper } from "~/lib/render/paper";
import type { PageElement } from "~/types/document";
import { assetUrlAsync, imageSourceKey } from "./useElementImages";

const scaledCanvas = (width: number, height: number, scale: number) => {
  const { element, context } = canvas(Math.round(width * scale), Math.round(height * scale));
  context.scale(scale, scale);
  return { element, context };
};

/** Alles, was der Renderer als Bild anfragt: Bilder, gesetzte Formeln und die Formeln der Tabellenzellen. */
const sourcesOf = (elements: PageElement[]): RenderSource[] =>
  elements.flatMap((element): RenderSource[] => {
    if (element.type === "image") return [element.source];
    if (element.type === "latex") return [latexImageSource(element)];
    if (element.type !== "table" || !Array.isArray(element.cells)) return [];
    return element.cells.flatMap((row) => (Array.isArray(row) ? row : []))
      .flatMap((cell): FormulaSource[] => {
        const formula = typeof cell === "string" ? formulaOfCell(cell) : null;
        return formula ? [{ kind: "formula", source: formula, color: CELL_INK }] : [];
      });
  });

/**
 * Exportiert die geöffnete Seite als PDF (US4 in haex-space/haex-vault@d91e91721e4aca4e926fb6c32152c79f317b2d52:specs/046-paper-notes-canvas/spec.md):
 * erst alle Bilder und Handschriften laden, dann die Seite so rastern, wie der Canvas sie zeigt,
 * und die PDF über den Speichern-Dialog von holzi ablegen.
 */
export function usePdfExport() {
  const assetStore = useAssetStore();
  const haexVault = useHaexVaultStore();

  /**
   * Anders als auf dem Bildschirm wird erst gezeichnet, wenn alle Bilder da sind. Ein Bild, das
   * fehlt oder nicht lädt, bleibt wie dort ein Platzhalter und bricht den Export nicht ab.
   */
  async function loadImagesAsync(sources: RenderSource[]): Promise<{ lookup: ImageLookup; release: () => void }> {
    const images = new Map<string, HTMLImageElement>();
    const urls: string[] = [];
    const release = () => { for (const url of urls) URL.revokeObjectURL(url); };
    // Eine Quelle je Schlüssel: dasselbe Bild auf mehreren Elementen lädt nur einmal.
    const unique = new Map(sources.map((source) => [imageSourceKey(source), source]));
    await Promise.all([...unique].map(async ([key, source]) => {
      try {
        const src = source.kind === "inline"
          ? source.dataUrl
          : source.kind === "formula"
            ? await formulaImageUrlAsync(source.source, source.color)
            : await assetUrlAsync(assetStore, source.assetId);
        if (!src) return;
        if (source.kind === "asset") urls.push(src);
        const image = new Image();
        image.src = src;
        await image.decode();
        images.set(key, image);
      } catch (error) {
        console.warn("[haex-notes] An image of the page is left out of the PDF:", error);
      }
    }));
    return { lookup: (source) => images.get(imageSourceKey(source)) ?? null, release };
  }

  async function rasterAsync(doc: PageDoc, elements: PageElement[], settings: PdfSettings): Promise<Uint8Array> {
    const scale = RASTER_SCALE[settings.quality];
    // Wie auf dem Bildschirm: nur ein eingebettetes Overlay wird gezeichnet.
    const overlay = doc.background.overlay;
    const overlaySource = overlay?.type === "image" && overlay.source.kind === "inline" ? overlay.source : null;
    // Die Canvas zuerst: schlägt ihre Anlage fehl (großer Speicherbedarf), sind noch keine Object-URLs offen.
    const page = scaledCanvas(doc.width, doc.height, scale);
    const content = scaledCanvas(doc.width, doc.height, scale);
    const images = await loadImagesAsync([...sourcesOf(elements), ...(overlaySource ? [overlaySource] : [])]);
    try {
      drawPaper(page.context, doc.background, doc.width, doc.height, overlaySource ? images.lookup(overlaySource) : null);
      // Eigener Canvas wie auf dem Bildschirm: der Radierer stanzt Striche aus, nicht das Papier.
      drawElements(content.context, elements, undefined, images.lookup);
      page.context.drawImage(content.element, 0, 0, doc.width, doc.height);
      return await jpegBytesAsync(page.element, PDF_JPEG_QUALITY[settings.quality]);
    } finally {
      images.release();
      // Gibt den Speicher der großen Canvas gleich frei statt erst beim nächsten Aufräumen.
      page.element.width = content.element.width = 0;
    }
  }

  /** false, wenn der Schüler den Speichern-Dialog abbricht. */
  async function exportPageAsync(doc: PageDoc, settings: PdfSettings, fileName: string, dialogTitle: string): Promise<boolean> {
    await loadHandwritingFontsAsync(document.baseURI);
    const elements = exportLayers(doc.layers).flatMap((layer) => layer.elements);
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
