/**
 * Origin of the page that called WebAuthn, derived from the message sender
 * rather than from anything the page sent. The WebAuthn scripts run in the top
 * frame only (no `all_frames` in the manifest), so a message from any other
 * frame is not ours to answer and the tab URL is the caller's URL.
 */
export function callerOrigin(frameId: number | undefined, tabUrl: string | undefined): string | null {
  if (frameId !== undefined && frameId !== 0)
    return null
  if (!tabUrl)
    return null
  try {
    const { origin } = new URL(tabUrl)
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

function isSecureOrigin(url: URL): boolean {
  return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')
}

/**
 * Whether a page at `origin` may use `rpId`: WebAuthn allows the page's own
 * host or a parent domain of it, and only in a secure context.
 *
 * ponytail: no public-suffix check, so an rpId like "co.uk" passes for a page
 * on example.co.uk. Browsers reject that themselves; the vault (holzi checks
 * the origin, 049 FR-032) is the layer that must not sign for it. Upgrade path:
 * bundle a public-suffix list if the extension ever signs on its own.
 */
export function rpIdMatchesOrigin(rpId: string, origin: string): boolean {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (!isSecureOrigin(url) || !rpId)
    return false
  const host = url.hostname
  return host === rpId || host.endsWith(`.${rpId}`)
}
