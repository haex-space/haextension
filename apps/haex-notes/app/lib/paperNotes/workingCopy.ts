import type { Rotation } from "./mapResult";

/**
 * Die Arbeitskopie eines Fotos (FR-002 in haex-space/haex-vault@74263d8c6e8e23831e4a5016797c3db4987d8697:specs/046-paper-notes-canvas/spec.md): aufrecht gedreht, auf höchstens
 * {@link MAX_EDGE} Pixel verkleinert und im Kontrast gestreckt. Das Original bleibt unverändert;
 * gelesen wird nur die Kopie. Eine Perspektivkorrektur fehlt noch.
 */

/** Längste Kante der Arbeitskopie. */
export const MAX_EDGE = 2048;
/** Längste Kante, auf der die Qualität geprüft wird. */
const SAMPLE_EDGE = 512;
const JPEG_QUALITY = 0.9;

export type QualityHint = "dark" | "lowContrast" | "blurry";

/** Maße nach Drehung und Verkleinerung. */
export function workingSize(width: number, height: number, rotation: Rotation) {
  const turned = rotation === 90 || rotation === 270;
  const [w, h] = turned ? [height, width] : [width, height];
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
}

const luma = (pixels: Uint8ClampedArray, i: number) =>
  0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;

/** Hinweise zur Qualität eines Fotos aus seinen RGBA-Pixeln (am besten verkleinert). */
export function qualityOf(pixels: Uint8ClampedArray, width: number, height: number): QualityHint[] {
  const gray = new Float32Array(width * height);
  let sum = 0;
  for (let p = 0; p < gray.length; p++) {
    gray[p] = luma(pixels, p * 4);
    sum += gray[p]!;
  }
  const mean = sum / gray.length;
  let variance = 0;
  for (const value of gray) variance += (value - mean) ** 2;
  const deviation = Math.sqrt(variance / gray.length);
  // Schärfe: Varianz des Laplace-Filters; ein verwackeltes Foto hat kaum Kanten.
  let edges = 0;
  let edgeSum = 0;
  let edgeSquares = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const laplace = 4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - width]! - gray[i + width]!;
      edges++;
      edgeSum += laplace;
      edgeSquares += laplace * laplace;
    }
  }
  const sharpness = edges ? edgeSquares / edges - (edgeSum / edges) ** 2 : 0;
  const hints: QualityHint[] = [];
  if (mean < 70) hints.push("dark");
  if (deviation < 25) hints.push("lowContrast");
  else if (sharpness < 40) hints.push("blurry");
  return hints;
}

/** Streckt den Kontrast: das hellste und dunkelste Prozent werden zu Weiß und Schwarz. */
export function stretchLevels(pixels: Uint8ClampedArray): void {
  const histogram = new Uint32Array(256);
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) histogram[Math.round(luma(pixels, i))]!++;
  const cut = count * 0.01;
  let low = 0;
  for (let seen = 0; low < 255 && seen + histogram[low]! <= cut; low++) seen += histogram[low]!;
  let high = 255;
  for (let seen = 0; high > 0 && seen + histogram[high]! <= cut; high--) seen += histogram[high]!;
  if (high - low < 16) return;
  const factor = 255 / (high - low);
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) pixels[i + c] = (pixels[i + c]! - low) * factor;
  }
}

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("[haex-notes] No 2D canvas available");
  return { element, context };
}

async function jpegBytesAsync(element: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => element.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("[haex-notes] Could not encode the working copy");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Liest ein Foto aus seinen Bytes. */
export function decodeAsync(bytes: Uint8Array, mimeType: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes as BlobPart], { type: mimeType }));
}

/** Qualitätshinweise eines Fotos, auf einer verkleinerten Kopie geprüft. */
export function photoQuality(photo: ImageBitmap): QualityHint[] {
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(photo.width, photo.height));
  const { context } = canvas(Math.round(photo.width * scale), Math.round(photo.height * scale));
  context.drawImage(photo, 0, 0, context.canvas.width, context.canvas.height);
  const { data, width, height } = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
  return qualityOf(data, width, height);
}

export interface WorkingCopy {
  /** Zum Ausschneiden der Bildregionen. */
  element: HTMLCanvasElement;
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Dreht, verkleinert und streckt ein Foto zur Arbeitskopie (JPEG). */
export async function makeWorkingCopyAsync(photo: ImageBitmap, rotation: Rotation): Promise<WorkingCopy> {
  const size = workingSize(photo.width, photo.height, rotation);
  const { element, context } = canvas(size.width, size.height);
  context.translate(size.width / 2, size.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  const w = photo.width * size.scale;
  const h = photo.height * size.scale;
  context.drawImage(photo, -w / 2, -h / 2, w, h);
  context.setTransform(1, 0, 0, 1, 0, 0);
  const image = context.getImageData(0, 0, size.width, size.height);
  stretchLevels(image.data);
  context.putImageData(image, 0, 0);
  return { element, bytes: await jpegBytesAsync(element), width: size.width, height: size.height };
}

/** Schneidet eine Box `[x1, y1, x2, y2]` (0–1000) aus der Arbeitskopie (JPEG). */
export async function cropAsync(copy: WorkingCopy, box: readonly number[]): Promise<Uint8Array> {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = box;
  const sx = Math.round((x1 / 1000) * copy.width);
  const sy = Math.round((y1 / 1000) * copy.height);
  const width = Math.max(1, Math.round(((x2 - x1) / 1000) * copy.width));
  const height = Math.max(1, Math.round(((y2 - y1) / 1000) * copy.height));
  const { element, context } = canvas(width, height);
  context.drawImage(copy.element, sx, sy, width, height, 0, 0, width, height);
  return jpegBytesAsync(element);
}

/** Base64 der Bytes für den Auftrag. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
