const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

/** MIME type of an image file by its extension; PNG when unknown. */
export function imageMimeType(path: string): string {
  const extension = path.split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "image/png";
}

// Large enough to be fast, small enough for String.fromCharCode's argument limit.
const CHUNK_SIZE = 0x8000;

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
