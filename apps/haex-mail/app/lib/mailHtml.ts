// Rendering helpers for message bodies. All parsing runs client-side via
// DOMParser (the extension is an SPA — `ssr: false`).

/** A run of plain text, or a bare URL that should render as a clickable link. */
export type TextPart = { text: string } | { url: string; text: string };

// URLs stop before whitespace, angle brackets, quotes and a closing paren so
// that "label (https://x)" yields the URL without the trailing bracket.
const URL_RE = /(https?:\/\/[^\s<>()"']+)/gi;

/** True for an absolute http(s) URL — the only links the view hands to the
 *  system browser. The mail iframe can post any string, so its link messages
 *  are checked here rather than trusted. */
export const isWebUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/** Split plain text into parts, marking bare URLs so the view can make them
 *  clickable (a `<pre>` swallows them as inert text otherwise). */
export const linkifyText = (text: string): TextPart[] => {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i) });
    parts.push({ url: m[0], text: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
};

/** Plain-text rendering of an HTML body that keeps link targets visible —
 *  used when a message has no text/plain part, where a naive strip would drop
 *  the URLs behind anchor labels. */
export const htmlToText = (bodyHtml: string): string => {
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
  doc.querySelectorAll("style, script, head").forEach((el) => el.remove());
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    const label = a.textContent?.trim() ?? "";
    // Surface the real target as "label (url)" unless it already is the url.
    if (/^https?:\/\//i.test(href) && href !== label) {
      a.textContent = label ? `${label} (${href})` : href;
    }
  });
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc
    .querySelectorAll("p, div, tr, li, h1, h2, h3, h4, h5, h6, blockquote")
    .forEach((el) => el.append("\n"));
  const text = doc.body?.textContent ?? "";
  return text
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// External resource references we neutralise / inline. Protocol-relative
// (`//host/…`) counts as remote too — mail clients resolve it against https.
const REMOTE_ATTRS = ["src", "background", "poster", "xlink:href"];
// SVG2 resources (`<image href>`, `<use href>`) use a plain `href`; on a link
// it is the target, which the bridge opens on click.
const REMOTE_ATTRS_WITH_HREF = [...REMOTE_ATTRS, "href"];
const remoteAttrsOf = (el: Element): string[] =>
  el.localName === "a" || el.localName === "area" ? REMOTE_ATTRS : REMOTE_ATTRS_WITH_HREF;
// Matches `url(...)` and a bare string where CSS takes a URL without the
// `url()` wrapper — `@import "…"` and `image-set("…" 1x, "…" 2x)`. The URL is
// in group 2 for the former, group 4 for the latter.
const STYLE_URL_RE =
  /url\(\s*(['"]?)((?:https?:)?\/\/[^'")]+)\1\s*\)|(?<=(?:@import|image-set\()\s*|,\s*)(['"])((?:https?:)?\/\/[^'"]+)\3/gi;
const styleMatchUrl = (m: RegExpMatchArray): string => (m[2] ?? m[4])!;

// CSS escapes can spell `url(` or a scheme (`u\72l(`, `\68ttps:`) past the
// pattern above. Unescaping letters, digits and URL punctuation exposes them;
// escaped quotes stay, so strings keep their bounds.
const unescapeCss = (css: string): string =>
  css.replace(
    /\\(?:([0-9a-f]{1,6})\s?|([^0-9a-f\r\n\f]))/gi,
    (escape, hex: string | undefined, char: string | undefined) => {
      const code = hex ? Number.parseInt(hex, 16) : undefined;
      if (code !== undefined && code > 0x10ffff) return escape;
      const c = code !== undefined ? String.fromCodePoint(code) : char!;
      return /^[\w:/.]$/.test(c) ? c : escape;
    },
  );

const cssUrls = (css: string): string[] =>
  [...unescapeCss(css).matchAll(STYLE_URL_RE)].map(styleMatchUrl);

/** `css` with every remote reference rewritten by `replace`, or null when it
 *  has none and stays untouched. Rewritten CSS comes back unescaped, which can
 *  alter an escaped selector (`#\31 23`) — only CSS that loads remote content. */
const rewriteCssUrls = (css: string, replace: (url: string) => string): string | null => {
  let found = false;
  const rewritten = unescapeCss(css).replace(
    STYLE_URL_RE,
    (_match, _q1, url1: string | undefined, _q2, url2: string | undefined) => {
      found = true;
      return replace((url1 ?? url2)!);
    },
  );
  return found ? rewritten : null;
};

const isExternalUrl = (url: string | null | undefined): url is string =>
  !!url && /^(?:https?:)?\/\//i.test(url.trim());

// Protocol-relative URLs have no scheme; assume https when fetching them.
const toFetchUrl = (url: string): string =>
  url.startsWith("//") ? `https:${url}` : url;

// srcset is a comma-separated list of "<url> <descriptor>?" candidates; the
// first whitespace-delimited token of each candidate is the URL.
const parseSrcset = (
  srcset: string,
): { url: string; descriptor: string }[] =>
  srcset
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [url, ...rest] = c.split(/\s+/);
      return { url: url ?? "", descriptor: rest.join(" ") };
    });

// The iframe inherits the host's Content-Security-Policy, which rejects inline
// scripts but allows the extension's own URL — so the bridge (see
// public/mail-bridge.js) is loaded from there instead of being inlined.
// `crossorigin` is required: WebKitGTK refuses a no-cors load of the
// extension's custom scheme from the iframe's opaque origin ("Unsafe attempt
// to load URL … from origin null"); in CORS mode holzi's
// `Access-Control-Allow-Origin: *` lets it through, as for the app's own
// module scripts.
const appendLinkBridge = (doc: Document) => {
  const bridge = doc.createElement("script");
  bridge.setAttribute("src", new URL("mail-bridge.js", document.baseURI).href);
  bridge.setAttribute("crossorigin", "");
  doc.body.append(bridge);
};

/** Neutralise active content before the body renders in a script-enabled
 *  iframe: strip script-bearing elements, inline event handlers and
 *  `javascript:` URLs. Defence-in-depth — the iframe is an opaque origin
 *  (no `allow-same-origin`) and the vault CSP blocks network regardless. */
const hardenDoc = (doc: Document) => {
  doc
    .querySelectorAll(
      // `template`: DOMParser leaves its content unparsed (invisible to the
      // passes below), the iframe turns `shadowrootmode` ones into live DOM.
      // `plaintext`: swallows everything after it, the bridge script included.
      "script, noscript, iframe, object, embed, link, meta[http-equiv], base, template, plaintext",
    )
    .forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
    }
    // Cover both plain `href` and SVG's namespaced `xlink:href`.
    for (const attr of ["href", "xlink:href"]) {
      const v = el.getAttribute(attr);
      if (v && /^\s*javascript:/i.test(v)) el.removeAttribute(attr);
    }
  });
  // Links open only in the host's system browser (via the bridge). Should the
  // bridge not run, a plain click would load the page inside the iframe, i.e.
  // inside the vault; `_blank` turns that into a popup the sandbox blocks.
  // In-mail anchors (`#…`) keep scrolling the iframe.
  doc.querySelectorAll("a[href], area[href]").forEach((el) => {
    if (!el.getAttribute("href")?.trim().startsWith("#")) el.setAttribute("target", "_blank");
  });
};

const FRAME_CSS =
  "html{color-scheme:light}" +
  "body{margin:0;padding:12px;background:#fff;color:#111;" +
  "font-family:system-ui,-apple-system,sans-serif;overflow-wrap:break-word}" +
  "a{color:#2563eb}img{max-width:100%;height:auto}";

/** Serialize the hardened mail as the sandboxed iframe's document. The whole
 *  document is kept: the parser moves leading `<style>` blocks into `<head>`
 *  and the sender's `<body>` carries attributes. Emails are authored for a
 *  white surface, so `color-scheme: light` and a light background come first
 *  (fixes dark-text-on-dark-theme) — the sender's own styles still override
 *  them. A bridge script forwards link clicks to the host, which opens them
 *  in the system browser. */
const toFrameHtml = (doc: Document): string => {
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  const colorScheme = doc.createElement("meta");
  colorScheme.setAttribute("name", "color-scheme");
  colorScheme.setAttribute("content", "light");
  const defaults = doc.createElement("style");
  defaults.textContent = FRAME_CSS;
  doc.head.prepend(charset, colorScheme, defaults);
  // An author style sheet (the defaults) outranks the legacy attribute.
  const bgcolor = doc.body.getAttribute("bgcolor");
  if (bgcolor) {
    doc.body.setAttribute(
      "style",
      `background-color:${bgcolor};${doc.body.getAttribute("style") ?? ""}`,
    );
  }
  appendLinkBridge(doc);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
};

/** A content id as an attachment's `contentId` and a `cid:` URL carry it. */
export const normalizeContentId = (id: string): string => id.trim().replace(/^<|>$/g, "");

const contentIdOf = (url: string): string | null => {
  const m = /^\s*cid:(.+)$/i.exec(url);
  if (!m) return null;
  try {
    return normalizeContentId(decodeURIComponent(m[1]!));
  } catch {
    return normalizeContentId(m[1]!);
  }
};

/** Content ids of the message parts a body shows as `cid:` images (RFC 2392). */
export const referencedContentIds = (bodyHtml: string): Set<string> => {
  const ids = new Set<string>();
  for (const m of bodyHtml.matchAll(/\bcid:[^"'\s)>]+/gi)) {
    const id = contentIdOf(m[0]);
    if (id) ids.add(id);
  }
  return ids;
};

/** Point `cid:` images at the `data:` URLs of their message parts. */
const showInlineImages = (doc: Document, inlineImages: ReadonlyMap<string, string>) => {
  if (inlineImages.size === 0) return;
  doc.querySelectorAll("img[src]").forEach((img) => {
    const id = contentIdOf(img.getAttribute("src") ?? "");
    const data = id === null ? undefined : inlineImages.get(id);
    if (data) img.setAttribute("src", data);
  });
};

/** Remove references to remote resources and report whether any existed, so
 *  the view can offer an explicit "load external content" action. The vault
 *  CSP blocks these regardless; stripping them just avoids broken-image noise. */
export const stripExternalHtml = (
  bodyHtml: string,
  inlineImages: ReadonlyMap<string, string> = new Map(),
): { html: string; hasExternal: boolean } => {
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
  hardenDoc(doc);
  showInlineImages(doc, inlineImages);
  let hasExternal = false;
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of remoteAttrsOf(el)) {
      if (isExternalUrl(el.getAttribute(attr))) {
        hasExternal = true;
        el.removeAttribute(attr);
      }
    }
    const srcset = el.getAttribute("srcset");
    if (srcset && parseSrcset(srcset).some((c) => isExternalUrl(c.url))) {
      hasExternal = true;
      el.removeAttribute("srcset");
    }
    const style = el.getAttribute("style");
    const stripped = style && rewriteCssUrls(style, () => "none");
    if (stripped) {
      hasExternal = true;
      el.setAttribute("style", stripped);
    }
  });
  // <style> blocks (e.g. `background:url(...)` in newsletters) carry remote
  // refs the per-element style attribute pass above never sees.
  doc.querySelectorAll("style").forEach((el) => {
    const stripped = rewriteCssUrls(el.textContent ?? "", () => "none");
    if (stripped !== null) {
      hasExternal = true;
      el.textContent = stripped;
    }
  });
  return { html: toFrameHtml(doc), hasExternal };
};

/** Replace remote resource references with `data:` URLs fetched through the
 *  host (`toDataUrl`), bypassing the webview CSP. Each URL is fetched once;
 *  failures leave that reference dropped rather than aborting the render. */
export const inlineExternalHtml = async (
  bodyHtml: string,
  toDataUrl: (url: string) => Promise<string>,
  inlineImages: ReadonlyMap<string, string> = new Map(),
): Promise<string> => {
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
  hardenDoc(doc);
  showInlineImages(doc, inlineImages);
  const urls = new Set<string>();
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of remoteAttrsOf(el)) {
      const v = el.getAttribute(attr);
      if (isExternalUrl(v)) urls.add(v);
    }
    const srcset = el.getAttribute("srcset");
    if (srcset)
      for (const c of parseSrcset(srcset)) if (isExternalUrl(c.url)) urls.add(c.url);
    const style = el.getAttribute("style");
    if (style) for (const url of cssUrls(style)) urls.add(url);
  });
  doc.querySelectorAll("style").forEach((el) => {
    for (const url of cssUrls(el.textContent ?? "")) urls.add(url);
  });

  const resolved = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        resolved.set(url, await toDataUrl(toFetchUrl(url)));
      } catch {
        // Unreachable/blocked resource — leave it stripped below.
      }
    }),
  );

  const inlineUrl = (url: string) =>
    resolved.has(url) ? `url("${resolved.get(url)}")` : "none";
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of remoteAttrsOf(el)) {
      const v = el.getAttribute(attr);
      if (isExternalUrl(v)) {
        if (resolved.has(v)) el.setAttribute(attr, resolved.get(v)!);
        else el.removeAttribute(attr);
      }
    }
    const srcset = el.getAttribute("srcset");
    if (srcset) {
      // base64 data: URLs carry no whitespace, so a ", " join stays a valid
      // srcset; candidates that failed to resolve are dropped.
      const rebuilt = parseSrcset(srcset)
        .map((c) => {
          if (!isExternalUrl(c.url))
            return c.descriptor ? `${c.url} ${c.descriptor}` : c.url;
          const data = resolved.get(c.url);
          if (!data) return null;
          return c.descriptor ? `${data} ${c.descriptor}` : data;
        })
        .filter((c): c is string => c != null)
        .join(", ");
      if (rebuilt) el.setAttribute("srcset", rebuilt);
      else el.removeAttribute("srcset");
    }
    const style = el.getAttribute("style");
    const inlined = style && rewriteCssUrls(style, inlineUrl);
    if (inlined) el.setAttribute("style", inlined);
  });
  doc.querySelectorAll("style").forEach((el) => {
    const inlined = rewriteCssUrls(el.textContent ?? "", inlineUrl);
    if (inlined !== null) el.textContent = inlined;
  });
  return toFrameHtml(doc);
};
