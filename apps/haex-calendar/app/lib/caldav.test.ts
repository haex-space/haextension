// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assertCaldavStatus, parseMultistatus } from "./caldav";

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
