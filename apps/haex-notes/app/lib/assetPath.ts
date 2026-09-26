/**
 * Reine Helfer für den Asset-Store. Die Dateizugriffe selbst liegen in
 * useAssetStore — hier steht nur, was ohne Filesystem testbar ist.
 */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};

export function extensionFor(mimeType: string, fileName?: string): string {
  const known = EXTENSION_BY_MIME[mimeType.toLowerCase()];
  if (known) return known;

  const parts = fileName?.split(".") ?? [];
  const candidate = parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(candidate) ? candidate : "bin";
}

/**
 * Pfad einer Datei relativ zum Asset-Wurzelverzeichnis.
 *
 * Der Zwei-Zeichen-Shard verhindert, dass ein einzelnes Verzeichnis zehntausende
 * Einträge bekommt — das ist auf manchen Dateisystemen spürbar langsam.
 */
export function assetRelPath(sha256: string, extension: string): string {
  return `${sha256.slice(0, 2)}/${sha256}.${extension}`;
}
