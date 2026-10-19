// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assertCaldavStatus, escapeXml, normalizeHref, parseMultistatus, resourceHref } from "./caldav";

const MULTISTATUS = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/cal/a.ics</d:href>
    <d:propstat>
      <d:prop><d:getetag>"1"</d:getetag></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

describe("parseMultistatus", () => {
  it("reads hrefs and successful props", () => {
    expect(parseMultistatus(MULTISTATUS)).toEqual([
      { href: "/cal/a.ics", props: { getetag: '"1"' } },
    ]);
  });

  it("accepts an empty multistatus (collection without resources)", () => {
    expect(parseMultistatus('<d:multistatus xmlns:d="DAV:"/>')).toEqual([]);
  });

  it("rejects an HTML error page instead of reporting zero resources", () => {
    expect(() => parseMultistatus("<html><body>Service Unavailable</body></html>")).toThrow();
  });

  it("rejects an empty body", () => {
    expect(() => parseMultistatus("")).toThrow();
  });
});

describe("assertCaldavStatus", () => {
  it("passes 2xx responses", () => {
    expect(() => assertCaldavStatus(200, "OK", "PROPFIND")).not.toThrow();
    expect(() => assertCaldavStatus(207, "Multi-Status", "REPORT")).not.toThrow();
  });

  it("throws on auth and server errors", () => {
    expect(() => assertCaldavStatus(401, "Unauthorized", "REPORT")).toThrow(/401/);
    expect(() => assertCaldavStatus(503, "Service Unavailable", "PROPFIND")).toThrow(/503/);
  });
});

describe("resourceHref", () => {
  it("encodes the UID as a single path segment", () => {
    expect(resourceHref("/dav/cal/", "a b/c")).toBe("/dav/cal/a%20b%2Fc.ics");
  });

  it("keeps the href of default UIDs unchanged", () => {
    expect(resourceHref("/dav/cal/", "123@haex-calendar")).toBe("/dav/cal/123@haex-calendar.ics");
  });

  it("adds the missing collection slash", () => {
    expect(resourceHref("/dav/cal", "id")).toBe("/dav/cal/id.ics");
  });
});

describe("normalizeHref", () => {
  it("treats encoded and plain hrefs as the same resource", () => {
    expect(normalizeHref("/dav/cal/a%40x.ics")).toBe(normalizeHref("/dav/cal/a@x.ics"));
  });

  it("strips the origin of absolute hrefs", () => {
    expect(normalizeHref("https://dav.example.com/dav/cal/a.ics")).toBe("/dav/cal/a.ics");
  });
});

describe("escapeXml", () => {
  it("escapes markup characters in hrefs", () => {
    expect(escapeXml("/cal/a&b<c>.ics")).toBe("/cal/a&amp;b&lt;c&gt;.ics");
  });
});
