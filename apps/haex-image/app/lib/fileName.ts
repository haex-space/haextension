/** `path` with the extension of its last segment replaced by `ext` (or `ext` appended if it has none). */
export function withExtension(path: string, ext: string): string {
  const nameStart = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
  const dot = path.lastIndexOf(".");
  const stem = dot > nameStart ? path.slice(0, dot) : path;
  return `${stem}.${ext}`;
}

/** File extension for an image type the canvas encodes; PNG is also the canvas fallback for unsupported types. */
export function extensionForType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  return "png";
}
