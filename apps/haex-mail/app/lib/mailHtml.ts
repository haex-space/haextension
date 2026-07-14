// Rendering helpers for message bodies. All parsing runs client-side via
// DOMParser (the extension is an SPA — `ssr: false`).

/** A run of plain text, or a bare URL that should render as a clickable link. */
export type TextPart = { text: string } | { url: string; text: string };

// URLs stop before whitespace, angle brackets, quotes and a closing paren so
// that "label (https://x)" yields the URL without the trailing bracket.
const URL_RE = /(https?:\/\/[^\s<>()"']+)/gi;

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
const REMOTE_ATTRS = ["src", "background", "poster"] as const;
const STYLE_URL_RE = /url\(\s*['"]?((?:https?:)?\/\/[^'")]+)['"]?\s*\)/gi;
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

// Injected into the iframe (which runs with `allow-scripts` but stays an
// opaque origin). Forwards link clicks to the host app so it can open them in
// the system browser — the extension is itself nested in a sandbox without
// `allow-popups`, so `target="_blank"` / `window.open` would be blocked.
const LINK_BRIDGE =
  `<script>(function(){addEventListener("click",function(e){` +
  `var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;` +
  `var h=a.getAttribute("href")||"";` +
  `if(/^https?:\\/\\//i.test(h)){e.preventDefault();` +
  `parent.postMessage({haexMailOpenUrl:h},"*");}},true);})();<\/script>`;

/** Neutralise active content before the body renders in a script-enabled
 *  iframe: strip script-bearing elements, inline event handlers and
 *  `javascript:` URLs. Defence-in-depth — the iframe is an opaque origin
 *  (no `allow-same-origin`) and the vault CSP blocks network regardless. */
const hardenDoc = (doc: Document) => {
  doc
    .querySelectorAll("script, noscript, iframe, object, embed, link, meta[http-equiv]")
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
};

/** Wrap a body fragment for the sandboxed iframe: emails are authored for a
 *  white surface, so force `color-scheme: light` and a light background (fixes
 *  dark-text-on-dark-theme). A bridge script forwards link clicks to the host,
 *  which opens them in the system browser. */
const wrapEmailHtml = (bodyHtml: string): string =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta name="color-scheme" content="light">` +
  `<style>html{color-scheme:light}` +
  `body{margin:0;padding:12px;background:#fff;color:#111;` +
  `font-family:system-ui,-apple-system,sans-serif;overflow-wrap:break-word}` +
  `a{color:#2563eb}img{max-width:100%;height:auto}</style>` +
  `</head><body>${bodyHtml}${LINK_BRIDGE}</body></html>`;

/** Remove references to remote resources and report whether any existed, so
 *  the view can offer an explicit "load external content" action. The vault
 *  CSP blocks these regardless; stripping them just avoids broken-image noise. */
export const stripExternalHtml = (
  bodyHtml: string,
): { html: string; hasExternal: boolean } => {
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
  hardenDoc(doc);
  let hasExternal = false;
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of REMOTE_ATTRS) {
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
    if (style) {
      const stripped = style.replace(STYLE_URL_RE, "none");
      if (stripped !== style) {
        hasExternal = true;
        el.setAttribute("style", stripped);
      }
    }
  });
  // <style> blocks (e.g. `background:url(...)` in newsletters) carry remote
  // refs the per-element style attribute pass above never sees.
  doc.querySelectorAll("style").forEach((el) => {
    const css = el.textContent ?? "";
    const stripped = css.replace(STYLE_URL_RE, "none");
    if (stripped !== css) {
      hasExternal = true;
      el.textContent = stripped;
    }
  });
  return { html: wrapEmailHtml(doc.body?.innerHTML ?? ""), hasExternal };
};

/** Replace remote resource references with `data:` URLs fetched through the
 *  host (`toDataUrl`), bypassing the webview CSP. Each URL is fetched once;
 *  failures leave that reference dropped rather than aborting the render. */
export const inlineExternalHtml = async (
  bodyHtml: string,
  toDataUrl: (url: string) => Promise<string>,
): Promise<string> => {
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
  hardenDoc(doc);
  const urls = new Set<string>();
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of REMOTE_ATTRS) {
      const v = el.getAttribute(attr);
      if (isExternalUrl(v)) urls.add(v);
    }
    const srcset = el.getAttribute("srcset");
    if (srcset)
      for (const c of parseSrcset(srcset)) if (isExternalUrl(c.url)) urls.add(c.url);
    const style = el.getAttribute("style");
    if (style) for (const m of style.matchAll(STYLE_URL_RE)) urls.add(m[1]!);
  });
  doc.querySelectorAll("style").forEach((el) => {
    for (const m of (el.textContent ?? "").matchAll(STYLE_URL_RE)) urls.add(m[1]!);
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

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of REMOTE_ATTRS) {
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
    if (style) {
      el.setAttribute(
        "style",
        style.replace(STYLE_URL_RE, (whole, url: string) =>
          resolved.has(url) ? `url("${resolved.get(url)}")` : "none",
        ),
      );
    }
  });
  doc.querySelectorAll("style").forEach((el) => {
    el.textContent = (el.textContent ?? "").replace(
      STYLE_URL_RE,
      (whole, url: string) =>
        resolved.has(url) ? `url("${resolved.get(url)}")` : "none",
    );
  });
  return wrapEmailHtml(doc.body?.innerHTML ?? "");
};
