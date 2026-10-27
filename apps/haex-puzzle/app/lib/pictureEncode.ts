import type { EncodeResult } from './library'
import { isTooSmall } from './difficulty'
import { fitLongSide, MAX_BYTES, MAX_PIXELS, nextAttempt, THUMBNAIL_LONG_SIDE } from './pictureBudget'

/** A neutral ground, so transparent areas of a picture do not leave holes in the pieces. */
const BACKGROUND = '#e5e7eb'
const THUMBNAIL_QUALITY = 0.8

/** Decodes with the orientation stored in the file applied; null when the bytes are not a picture. */
async function decode(bytes: Uint8Array): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: 'from-image' })
  } catch {
    return null
  }
}

function draw(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  context.fillStyle = BACKGROUND
  context.fillRect(0, 0, width, height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/** WebP where the web view can encode it; otherwise JPEG (an unsupported type comes back as PNG). */
async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await toBlob(canvas, 'image/webp', quality)
  if (webp?.type === 'image/webp') return webp
  return toBlob(canvas, 'image/jpeg', quality)
}

/**
 * Turns a picked file into what the library stores: a copy with the longer side at most 2048 px
 * and at most 1 MiB, and a thumbnail (research R-2).
 */
export async function encodePicture(bytes: Uint8Array, _name?: string): Promise<EncodeResult> {
  const bitmap = await decode(bytes)
  if (!bitmap) return { ok: false, reason: 'unsupported' }

  try {
    const { width, height } = bitmap
    if (width * height > MAX_PIXELS) return { ok: false, reason: 'too-large' }
    if (isTooSmall(width, height)) return { ok: false, reason: 'too-small' }

    for (let attempt = 0; ; attempt++) {
      const size = nextAttempt(width, height, attempt)
      if (!size) return { ok: false, reason: 'too-large' }

      const blob = await encodeCanvas(draw(bitmap, size.width, size.height), size.quality)
      if (!blob) return { ok: false, reason: 'unsupported' }
      if (blob.size > MAX_BYTES) continue

      const thumbSize = fitLongSide(size.width, size.height, THUMBNAIL_LONG_SIDE)
      const thumbnail = await encodeCanvas(draw(bitmap, thumbSize.width, thumbSize.height), THUMBNAIL_QUALITY)
      if (!thumbnail) return { ok: false, reason: 'unsupported' }

      return {
        ok: true,
        data: new Uint8Array(await blob.arrayBuffer()),
        mimeType: blob.type,
        width: size.width,
        height: size.height,
        thumbnail: new Uint8Array(await thumbnail.arrayBuffer()),
      }
    }
  } finally {
    bitmap.close()
  }
}
