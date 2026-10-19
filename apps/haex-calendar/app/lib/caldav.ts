// Types for CalDAV responses
export interface CaldavCalendarInfo {
  displayName: string
  color: string | null
  path: string
  ctag: string | null
}

export interface CaldavEventInfo {
  href: string
  etag: string
  icsData?: string
}

export interface CaldavDiscoveryResult {
  principalUrl: string
  calendarHomeUrl: string
  calendars: CaldavCalendarInfo[]
}

export function buildAuthHeaders(username: string, password: string): Record<string, string> {
  return { Authorization: "Basic " + btoa(username + ":" + password) }
}

/**
 * Href for a new resource named after the UID inside a calendar collection.
 * "@" and ":" are valid in a path segment and stay readable, which keeps the
 * hrefs of existing `<uuid>@haex-calendar` resources unchanged.
 */
export function resourceHref(collectionPath: string, uid: string): string {
  const base = collectionPath.endsWith("/") ? collectionPath : `${collectionPath}/`
  const segment = encodeURIComponent(uid).replace(/%40/g, "@").replace(/%3A/gi, ":")
  return `${base}${segment}.ics`
}

/**
 * Comparable form of a server href: servers differ in percent-encoding and
 * may answer with absolute URLs for resources we stored as paths.
 */
export function normalizeHref(href: string): string {
  try {
    return decodeURIComponent(new URL(href, "http://caldav.invalid").pathname)
  } catch {
    return href
  }
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export function resolveUrl(href: string, serverUrl: string): string {
  return new URL(href, serverUrl).href
}

export interface MultistatusEntry {
  href: string
  props: Record<string, string | null>
}

/**
 * Throws unless the response is 2xx. The host's web API resolves on every
 * HTTP status, and an error page parsed as "zero resources" would make sync
 * delete the whole local calendar.
 */
export function assertCaldavStatus(status: number, statusText: string, method: string): void {
  if (status < 200 || status >= 300) {
    throw new Error(`CalDAV ${method} failed: ${status} ${statusText}`.trim())
  }
}

export function parseMultistatus(xmlText: string): MultistatusEntry[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, "application/xml")

  const root = doc.documentElement
  if (!root || root.namespaceURI !== "DAV:" || root.localName !== "multistatus") {
    throw new Error("CalDAV response is not a DAV:multistatus document")
  }

  const responses = doc.getElementsByTagNameNS("DAV:", "response")
  const entries: MultistatusEntry[] = []

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i]!
    const hrefEl = response.getElementsByTagNameNS("DAV:", "href")[0]
    const href = hrefEl?.textContent?.trim() ?? ""

    const props: Record<string, string | null> = {}
    const propStats = response.getElementsByTagNameNS("DAV:", "propstat")

    for (let j = 0; j < propStats.length; j++) {
      const propStat = propStats[j]!
      const statusEl = propStat.getElementsByTagNameNS("DAV:", "status")[0]
      const statusText = statusEl?.textContent ?? ""

      // Only process successful propstats
      if (!statusText.includes("200")) continue

      const propEl = propStat.getElementsByTagNameNS("DAV:", "prop")[0]
      if (!propEl) continue

      for (let k = 0; k < propEl.children.length; k++) {
        const child = propEl.children[k]!
        const key = child.localName

        // For nested elements like current-user-principal or calendar-home-set,
        // extract the href child
        const nestedHref = child.getElementsByTagNameNS("DAV:", "href")[0]
        if (nestedHref) {
          props[key] = nestedHref.textContent?.trim() ?? null
        } else {
          props[key] = child.textContent?.trim() || null
        }

        // Special handling for resourcetype — store child element names
        if (key === "resourcetype") {
          const types: string[] = []
          for (let l = 0; l < child.children.length; l++) {
            types.push(child.children[l]!.localName)
          }
          props["resourcetype"] = types.join(",")
        }
      }
    }

    entries.push({ href, props })
  }

  return entries
}
