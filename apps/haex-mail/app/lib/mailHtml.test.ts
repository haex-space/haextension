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
