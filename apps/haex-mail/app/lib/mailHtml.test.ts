// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  inlineExternalHtml,
  isWebUrl,
  normalizeContentId,
  referencedContentIds,
  stripExternalHtml,
} from "./mailHtml";

// The mail iframe can post any string as a link to open.
describe("isWebUrl", () => {
  it("accepts absolute http(s) URLs only", () => {
    expect(isWebUrl("https://example.com/a?b#c")).toBe(true);
    expect(isWebUrl("HTTP://example.com")).toBe(true);
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "mailto:x@example.com",
      "smb://host/share",
      "//example.com",
      "/relative",
      "",
    ]) {
      expect(isWebUrl(url)).toBe(false);
    }
  });
});

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

const frameOf = (html: string) => new DOMParser().parseFromString(html, "text/html");

// DOMParser hoists a leading <style> into <head>; the frame must keep it.
describe("sender styles", () => {
  it("keeps <style> blocks the parser moved into <head>", async () => {
    const fragment = "<style>.pre{display:none}</style><p class=\"pre\">preheader</p>";
    const full =
      "<html><head><style>p{color:red}</style></head><body><p>x</p></body></html>";
    for (const html of [
      stripExternalHtml(fragment).html,
      await inlineExternalHtml(fragment, async () => "data:,"),
    ]) {
      expect(frameOf(html).querySelector("style:not(:first-of-type)")?.textContent).toBe(
        ".pre{display:none}",
      );
    }
    expect(frameOf(stripExternalHtml(full).html).head.textContent).toContain("p{color:red}");
  });

  it("puts the default styles first so the sender's override them", () => {
    const { html } = stripExternalHtml("<style>body{background:#000}</style><p>x</p>");
    const styles = [...frameOf(html).querySelectorAll("style")].map((s) => s.textContent);
    expect(styles[0]).toContain("background:#fff");
    expect(styles[1]).toBe("body{background:#000}");
  });

  it("keeps the sender's body attributes", () => {
    const { html } = stripExternalHtml(
      '<html><body style="margin:4px" bgcolor="#eeeeee"><p>x</p></body></html>',
    );
    const body = frameOf(html).body;
    expect(body.getAttribute("style")).toBe("background-color:#eeeeee;margin:4px");
  });
});

// The vault CSP blocks what slips through, but then the "external content"
// banner lies and the bridge may not run.
describe("sanitizer gaps", () => {
  it("drops declarative shadow roots the parser never shows to the sanitizer", () => {
    const { html, hasExternal } = stripExternalHtml(
      '<div><template shadowrootmode="open"><img src="https://t.example/p.gif" onerror="x()"></template></div>',
    );
    expect(html).not.toContain("template");
    expect(html).not.toContain("t.example");
    expect(hasExternal).toBe(false);
  });

  it("keeps the bridge alive after a <plaintext> element", () => {
    expect(scriptsOf(stripExternalHtml("<p>x</p><plaintext>rest").html)).toHaveLength(1);
  });

  it("treats SVG href resources as external but keeps link targets", () => {
    const image = stripExternalHtml('<svg><image href="https://t.example/a.png"/></svg>');
    expect(image.hasExternal).toBe(true);
    expect(image.html).not.toContain("t.example");
    const link = stripExternalHtml('<svg><a href="https://x.example/"><text>x</text></a></svg>');
    expect(link.hasExternal).toBe(false);
    expect(link.html).toContain('href="https://x.example/"');
  });

  it("sees URLs spelled with CSS escapes", async () => {
    for (const style of [
      "background:u\\72l(https://t.example/p.gif)",
      "background:url(\\68ttps://t.example/p.gif)",
    ]) {
      const body = `<p style="${style}">x</p>`;
      const stripped = stripExternalHtml(body);
      expect(stripped.hasExternal).toBe(true);
      expect(stripped.html).not.toContain("t.example");
      const fetched: string[] = [];
      await inlineExternalHtml(body, async (url) => {
        fetched.push(url);
        return "data:,";
      });
      expect(fetched).toEqual(["https://t.example/p.gif"]);
    }
  });

  it("sees image-set candidates", () => {
    const { html, hasExternal } = stripExternalHtml(
      '<style>.a{background-image:image-set("https://t.example/a.png" 1x, "https://t.example/b.png" 2x)}</style>',
    );
    expect(hasExternal).toBe(true);
    expect(html).not.toContain("t.example");
  });

  it("leaves an SVG namespace inside a data: URL alone", () => {
    const { html, hasExternal } = stripExternalHtml(
      `<p style="background:url(&quot;data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>&quot;)">x</p>`,
    );
    expect(hasExternal).toBe(false);
    expect(html).toContain("http://www.w3.org/2000/svg");
  });
});

// Inline images reference the message's own MIME parts (RFC 2392).
describe("cid: images", () => {
  const body = '<p><img src="cid:logo%40example.com"><img src="cid:missing@x"></p>';

  it("lists the content ids a body references", () => {
    expect([...referencedContentIds(body)]).toEqual(["logo@example.com", "missing@x"]);
  });

  it("normalizes content ids from headers", () => {
    expect(normalizeContentId(" <logo@example.com> ")).toBe("logo@example.com");
  });

  it("shows resolved parts and leaves unknown ones alone", async () => {
    const images = new Map([["logo@example.com", "data:image/png;base64,AAAA"]]);
    for (const html of [
      stripExternalHtml(body, images).html,
      await inlineExternalHtml(body, async () => "data:,", images),
    ]) {
      const srcs = [...frameOf(html).querySelectorAll("img")].map((i) => i.getAttribute("src"));
      expect(srcs).toEqual(["data:image/png;base64,AAAA", "cid:missing@x"]);
    }
  });
});
