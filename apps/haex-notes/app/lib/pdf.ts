/**
 * PDF-Anhänge im Betrachter (holzi Spec 046, FR-023): pdf.js liest die Datei, und jede Seite wird zu einem Bild,
 * das der Betrachter wie ein Foto zoomt und verschiebt. pdf.js ist groß und wird erst geladen, wenn ein PDF
 * geöffnet wird.
 */

/** Wie breit eine Seite gerastert wird, damit ein Zoom bis etwa das Doppelte scharf bleibt. */
const TARGET_WIDTH_PX = 1800;
const SCALE_RANGE = { min: 0.5, max: 4 };

/** Ob ein Anhang ein PDF ist: nach dem Typ, sonst nach dem Dateinamen (manche Systeme nennen keinen Typ). */
export function isPdf(file: { mimeType: string; name: string }): boolean {
  return file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Der Maßstab, mit dem eine Seite von `pageWidth` Punkten gerastert wird. */
export function renderScale(pageWidth: number): number {
  if (!(pageWidth > 0)) return 1;
  return Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, TARGET_WIDTH_PX / pageWidth));
}

/** Ein geöffnetes PDF: seine Seitenzahl und jede Seite als PNG. */
export interface PdfFile {
  pageCount: number;
  /** Rastert die Seite `index` (ab 0) und gibt sie als PNG zurück. */
  renderPageAsync(index: number): Promise<Blob>;
  destroy(): void;
}

/** Öffnet ein PDF; wirft, wenn die Datei kein lesbares PDF ist. Die Bytes bleiben beim Aufrufer. */
export async function openPdfAsync(bytes: Uint8Array): Promise<PdfFile> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // pdf.js übernimmt die Bytes an seinen Worker; eine Kopie lässt dem Aufrufer die seinen.
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const document = await task.promise;
  return {
    pageCount: document.numPages,
    async renderPageAsync(index) {
      const page = await document.getPage(index + 1);
      const viewport = page.getViewport({ scale: renderScale(page.getViewport({ scale: 1 }).width) });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("[haex-notes] No canvas to render the PDF page");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error("[haex-notes] The PDF page could not be turned into an image");
      return blob;
    },
    destroy() {
      void task.destroy();
    },
  };
}
