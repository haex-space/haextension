// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { inlineExternalHtml, stripExternalHtml } from "./mailHtml";

const scriptsOf = (html: string) => [
  ...new DOMParser().parseFromString(html, "text/html").querySelectorAll("script"),
];

// The iframe inherits a CSP without 'unsafe-inline': an inline script there
// is silently blocked, which breaks opening links from the mail body.
describe("mail iframe document", () => {
  it("loads the link bridge from the extension's own URL, not inline", () => {
    const { html } = stripExternalHtml('<a href="https://example.com">x</a>');
    const scripts = scriptsOf(html);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.textContent).toBe("");
    expect(scripts[0]!.getAttribute("src")).toBe(
      new URL("mail-bridge.js", document.baseURI).href,
    );
  });

  // Without CORS mode, WebKitGTK blocks the load from the iframe's opaque
  // origin and neither sizing nor links work.
  it("loads the link bridge in CORS mode", () => {
    const { html } = stripExternalHtml("<p>hi</p>");
    expect(scriptsOf(html)[0]!.hasAttribute("crossorigin")).toBe(true);
  });

  it("never lets a link load its page inside the iframe", async () => {
    const body =
      '<a href="https://a.example" target="_self">a</a>' +
      '<a href="mailto:x@example.com">m</a><a href="#top">t</a>';
    for (const html of [
      stripExternalHtml(body).html,
      await inlineExternalHtml(body, async () => "data:,"),
    ]) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      expect([...doc.querySelectorAll("a")].map((a) => a.getAttribute("target"))).toEqual([
        "_blank",
        "_blank",
        null,
      ]);
    }
  });

  it("drops the sender's scripts and keeps only the bridge", async () => {
    const body = '<script>alert(1)</script><p>hi</p>';
    for (const html of [
      stripExternalHtml(body).html,
      await inlineExternalHtml(body, async () => "data:,"),
    ]) {
      expect(scriptsOf(html).map((s) => s.getAttribute("src"))).toEqual([
        new URL("mail-bridge.js", document.baseURI).href,
      ]);
    }
  });
});
