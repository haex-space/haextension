const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * The URL if it is safe to render as a link. Event URLs come from CalDAV
 * servers, imported files and shared spaces, so `javascript:`/`data:` and
 * other schemes are dropped.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}
