import {
  buildAuthHeaders,
  formatTimeRange,
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
  ): Promise<{ status: number; headers: Record<string, string>; text: string }> {
    const headers: Record<string, string> = {
      ...buildAuthHeaders(username, password),
      ...extraHeaders,
    }

    if (body) {
      headers["Content-Type"] = "application/xml; charset=utf-8"
    }

    const response = await haexVault.client.web.fetchAsync(url, {
      method,
      headers,
      body,
    })

    const text = new TextDecoder().decode(response.body)
    return { status: response.status, headers: response.headers, text }
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

    const wellKnownResponse = await caldavRequest(wellKnownUrl, "GET", undefined, username, password)
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

    const principalUrl = resolveUrl(principalHref, baseServerUrl)

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

    const calendarHomeUrl = resolveUrl(calendarHomeHref, baseServerUrl)

    // Step 4: List calendars
    const listBody = `<?xml version="1.0" encoding="UTF-8"?>
  <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">
    <d:prop>
      <d:displayname/>
      <d:resourcetype/>
      <ic:calendar-color/>
      <cs:getctag/>
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
        path: entry.href,
        ctag: entry.props["getctag"] ?? null,
      }))

    return {
      principalUrl: principalHref,
      calendarHomeUrl: calendarHomeHref,
      calendars,
    }
  }

  async function fetchEventListAsync(
    caldavPath: string,
    username: string,
    password: string,
    serverUrl: string,
    timeRange?: { start: string; end: string },
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

    // Step 2: Calendar query for event list
    let timeRangeXml = ""
    if (timeRange) {
      timeRangeXml = `\n           <c:time-range start="${formatTimeRange(timeRange.start)}" end="${formatTimeRange(timeRange.end)}"/>`
    }

    const queryBody = `<?xml version="1.0" encoding="UTF-8"?>
  <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
    <d:prop>
      <d:getetag/>
    </d:prop>
    <c:filter>
      <c:comp-filter name="VCALENDAR">
        <c:comp-filter name="VEVENT">${timeRangeXml}
        </c:comp-filter>
      </c:comp-filter>
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
    const hrefElements = hrefs.map((h) => `  <d:href>${h}</d:href>`).join("\n")

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

  async function putEventAsync(
    href: string,
    icsData: string,
    etag: string | null,
    username: string,
    password: string,
    serverUrl: string,
  ): Promise<string | null> {
    const fullUrl = resolveUrl(href, serverUrl)

    const headers: Record<string, string> = {
      ...buildAuthHeaders(username, password),
      "Content-Type": "text/calendar; charset=utf-8",
    }

    if (etag) {
      headers["If-Match"] = `"${etag.replace(/"/g, "")}"`
    }

    const response = await haexVault.client.web.fetchAsync(fullUrl, {
      method: "PUT",
      headers,
      body: icsData,
    })

    if (response.status >= 400) {
      throw new Error(`PUT failed: ${response.status} ${response.statusText}`)
    }

    const newEtag = response.headers["etag"] || response.headers["ETag"] || null
    return newEtag
  }

  async function deleteEventAsync(
    href: string,
    etag: string,
    username: string,
    password: string,
    serverUrl: string,
  ): Promise<void> {
    const fullUrl = resolveUrl(href, serverUrl)

    const headers: Record<string, string> = {
      ...buildAuthHeaders(username, password),
      "If-Match": `"${etag.replace(/"/g, "")}"`,
    }

    const response = await haexVault.client.web.fetchAsync(fullUrl, {
      method: "DELETE",
      headers,
    })

    if (response.status >= 400) {
      throw new Error(`DELETE failed: ${response.status} ${response.statusText}`)
    }
  }

  return {
    discoverAsync,
    fetchEventListAsync,
    fetchEventsDataAsync,
    putEventAsync,
    deleteEventAsync,
  }
}
