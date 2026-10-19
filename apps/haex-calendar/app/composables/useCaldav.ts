import {
  assertCaldavStatus,
  buildAuthHeaders,
  escapeXml,
  parseMultistatus,
  resolveUrl,
  type CaldavCalendarInfo,
  type CaldavDiscoveryResult,
  type CaldavEventInfo,
} from "~/lib/caldav"

/** CalDAV requests routed through the host's web API. */
export function useCaldav() {
  const haexVault = useHaexVaultStore()

  async function caldavRequest(
    url: string,
    method: string,
    body: string | undefined,
    username: string,
    password: string,
    extraHeaders: Record<string, string> = {},
    { allowAnyStatus = false }: { allowAnyStatus?: boolean } = {},
  ): Promise<{ status: number; statusText: string; headers: Record<string, string>; text: string }> {
    const headers: Record<string, string> = {
      ...buildAuthHeaders(username, password),
      ...(body ? { "Content-Type": "application/xml; charset=utf-8" } : {}),
      ...extraHeaders,
    }

    const response = await haexVault.client.web.fetchAsync(url, {
      method,
      headers,
      body,
    })

    if (!allowAnyStatus) assertCaldavStatus(response.status, response.statusText, method)

    const text = new TextDecoder().decode(response.body)
    return { status: response.status, statusText: response.statusText, headers: response.headers, text }
  }

  async function discoverAsync(
    serverUrl: string,
    username: string,
    password: string,
  ): Promise<CaldavDiscoveryResult> {
    // Normalize server URL — ensure no trailing slash for consistency
    const baseServerUrl = serverUrl.replace(/\/+$/, "")

    // Step 1: Well-known discovery
    let baseUrl = baseServerUrl
    const wellKnownUrl = baseServerUrl + "/.well-known/caldav"

    // Redirects and 404 are both expected answers here.
    const wellKnownResponse = await caldavRequest(wellKnownUrl, "GET", undefined, username, password, {}, {
      allowAnyStatus: true,
    })
    if ([301, 302, 303, 307, 308].includes(wellKnownResponse.status)) {
      const location = wellKnownResponse.headers["location"] || wellKnownResponse.headers["Location"]
      if (location) {
        baseUrl = resolveUrl(location, baseServerUrl)
      }
    }

    // Step 2: Get current-user-principal
    const principalBody = `<?xml version="1.0" encoding="UTF-8"?>
  <d:propfind xmlns:d="DAV:">
    <d:prop>
      <d:current-user-principal/>
    </d:prop>
  </d:propfind>`

    const principalResponse = await caldavRequest(baseUrl, "PROPFIND", principalBody, username, password, {
      Depth: "0",
    })

    const principalEntries = parseMultistatus(principalResponse.text)
    const principalHref = principalEntries[0]?.props["current-user-principal"]
    if (!principalHref) {
      throw new Error("CalDAV discovery failed: could not find current-user-principal")
    }

    // Hrefs in a redirected CalDAV response are relative to the URL we
    // actually addressed, not necessarily to the URL the user entered.
    const principalUrl = resolveUrl(principalHref, baseUrl)

    // Step 3: Get calendar-home-set
    const homeBody = `<?xml version="1.0" encoding="UTF-8"?>
  <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
    <d:prop>
      <c:calendar-home-set/>
    </d:prop>
  </d:propfind>`

    const homeResponse = await caldavRequest(principalUrl, "PROPFIND", homeBody, username, password, {
      Depth: "0",
    })

    const homeEntries = parseMultistatus(homeResponse.text)
    const calendarHomeHref = homeEntries[0]?.props["calendar-home-set"]
    if (!calendarHomeHref) {
      throw new Error("CalDAV discovery failed: could not find calendar-home-set")
    }

    const calendarHomeUrl = resolveUrl(calendarHomeHref, principalUrl)

    // Step 4: List calendars
    const listBody = `<?xml version="1.0" encoding="UTF-8"?>
  <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ic="http://apple.com/ns/ical/">
    <d:prop>
      <d:displayname/>
      <d:resourcetype/>
      <ic:calendar-color/>
    </d:prop>
  </d:propfind>`

    const listResponse = await caldavRequest(calendarHomeUrl, "PROPFIND", listBody, username, password, {
      Depth: "1",
    })

    const listEntries = parseMultistatus(listResponse.text)

    const calendars: CaldavCalendarInfo[] = listEntries
      .filter((entry) => {
        const resourceType = entry.props["resourcetype"] ?? ""
        return resourceType.includes("calendar")
      })
      .map((entry) => ({
        displayName: entry.props["displayname"] ?? "Unnamed",
        color: entry.props["calendar-color"] ?? null,
        // Store absolute hrefs so later syncs keep working even when the
        // well-known endpoint redirected to another host or path.
        path: resolveUrl(entry.href, calendarHomeUrl),
      }))

    return {
      principalUrl,
      calendarHomeUrl,
      calendars,
    }
  }

  async function fetchEventListAsync(
    caldavPath: string,
    username: string,
    password: string,
    serverUrl: string,
  ): Promise<{ ctag: string | null; events: CaldavEventInfo[] }> {
    const fullUrl = resolveUrl(caldavPath, serverUrl)

    // Step 1: Get current CTag
    const ctagBody = `<?xml version="1.0" encoding="UTF-8"?>
  <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
    <d:prop>
      <cs:getctag/>
    </d:prop>
  </d:propfind>`

    const ctagResponse = await caldavRequest(fullUrl, "PROPFIND", ctagBody, username, password, {
      Depth: "0",
    })

    const ctagEntries = parseMultistatus(ctagResponse.text)
    const ctag = ctagEntries[0]?.props["getctag"] ?? null

    // Step 2: List every calendar object resource. No component filter: tasks
    // (VTODO) live in the same collections as events, and sync deletes local
    // rows whose href is missing from this list.
    const queryBody = `<?xml version="1.0" encoding="UTF-8"?>
  <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
    <d:prop>
      <d:getetag/>
    </d:prop>
    <c:filter>
      <c:comp-filter name="VCALENDAR"/>
    </c:filter>
  </c:calendar-query>`

    const queryResponse = await caldavRequest(fullUrl, "REPORT", queryBody, username, password, {
      Depth: "1",
    })

    const queryEntries = parseMultistatus(queryResponse.text)

    const events: CaldavEventInfo[] = queryEntries
      .filter((entry) => entry.props["getetag"])
      .map((entry) => ({
        href: entry.href,
        etag: entry.props["getetag"]!,
      }))

    return { ctag, events }
  }

  async function fetchEventsDataAsync(
    caldavPath: string,
    hrefs: string[],
    username: string,
    password: string,
    serverUrl: string,
  ): Promise<CaldavEventInfo[]> {
    if (hrefs.length === 0) return []

    const fullUrl = resolveUrl(caldavPath, serverUrl)
    const hrefElements = hrefs.map((h) => `  <d:href>${escapeXml(h)}</d:href>`).join("\n")

    const multigetBody = `<?xml version="1.0" encoding="UTF-8"?>
  <c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
    <d:prop>
      <d:getetag/>
      <c:calendar-data/>
    </d:prop>
  ${hrefElements}
  </c:calendar-multiget>`

    const response = await caldavRequest(fullUrl, "REPORT", multigetBody, username, password)

    const entries = parseMultistatus(response.text)

    return entries
      .filter((entry) => entry.props["getetag"])
      .map((entry) => ({
        href: entry.href,
        etag: entry.props["getetag"]!,
        icsData: entry.props["calendar-data"] ?? undefined,
      }))
  }

  /**
   * Create or update a resource. `etag` null with `create` false is an
   * update of a resource whose ETag the server never reported.
   */
  function ifMatch(etag: string): string {
    return `"${etag.replace(/"/g, "")}"`
  }

  async function putEventAsync(
    href: string,
    icsData: string,
    etag: string | null,
    create: boolean,
    username: string,
    password: string,
    serverUrl: string,
  ): Promise<string | null> {
    const headers: Record<string, string> = { "Content-Type": "text/calendar; charset=utf-8" }
    if (etag) headers["If-Match"] = ifMatch(etag)
    else if (create) headers["If-None-Match"] = "*"

    const response = await caldavRequest(resolveUrl(href, serverUrl), "PUT", icsData, username, password, headers)
    return response.headers["etag"] || response.headers["ETag"] || null
  }

  /** Delete a resource; an already missing resource counts as deleted. */
  async function deleteEventAsync(
    href: string,
    etag: string | null,
    username: string,
    password: string,
    serverUrl: string,
  ): Promise<void> {
    // Servers may omit the ETag on PUT; deleting without If-Match is then the
    // only way to remove the resource instead of letting it come back on sync.
    const headers: Record<string, string> = etag ? { "If-Match": ifMatch(etag) } : {}
    const response = await caldavRequest(resolveUrl(href, serverUrl), "DELETE", undefined, username, password, headers, {
      allowAnyStatus: true,
    })
    if (response.status !== 404) assertCaldavStatus(response.status, response.statusText, "DELETE")
  }

  return {
    discoverAsync,
    fetchEventListAsync,
    fetchEventsDataAsync,
    putEventAsync,
    deleteEventAsync,
  }
}
