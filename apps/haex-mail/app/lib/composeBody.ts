// Body model of the compose editor. The editor's HTML is the model;
// everything that leaves it (plain-text alternative, outgoing HTML) goes
// through the walkers below, so pasted or dropped markup never reaches a sent
// mail beyond a small set of formatting tags and safe links.

// Their content is code, not text the user wrote.
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The href when it is an absolute http(s)/mailto URL, otherwise undefined. */
export const safeHref = (href: string | null | undefined): string | undefined => {
  if (!href) return undefined;
  try {
    return SAFE_PROTOCOLS.has(new URL(href).protocol) ? href : undefined;
  } catch {
    return undefined;
  }
};

/** Tags that keep their meaning in outgoing HTML, with the tag they become. */
const FORMAT_TAGS: Record<string, string> = {
  STRONG: "strong",
  B: "strong",
  EM: "em",
  I: "em",
  U: "u",
  S: "s",
  STRIKE: "s",
  DEL: "s",
  UL: "ul",
  OL: "ol",
  LI: "li",
  BLOCKQUOTE: "blockquote",
};

/** Block-level tags a line break is implied around. */
const BLOCK_TAGS = new Set(["P", "DIV", "UL", "OL", "LI", "BLOCKQUOTE", "PRE"]);

const parse = (html: string) =>
  new DOMParser().parseFromString(html, "text/html").body;

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** True when the body holds anything a plain-text mail cannot express. */
export const bodyNeedsHtml = (html: string): boolean => {
  const root = parse(html);
  if (root.querySelector("strong, b, em, i, u, s, strike, del, ul, ol, blockquote")) {
    return true;
  }
  return Array.from(root.querySelectorAll("a")).some((a) =>
    safeHref(a.getAttribute("href")),
  );
};

/** Outgoing HTML: escaped text, paragraphs, line breaks, formatting and safe links only. */
export const bodyToHtml = (html: string): string => {
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    if (SKIPPED_TAGS.has(el.tagName)) return "";
    const inner = () => Array.from(el.childNodes).map(serialize).join("");
    if (el.tagName === "BR") return "<br>";
    if (el.tagName === "A") {
      const href = safeHref(el.getAttribute("href"));
      return href ? `<a href="${escapeHtml(href)}">${inner()}</a>` : inner();
    }
    if (el.tagName === "P" || el.tagName === "DIV") {
      // An empty paragraph is a blank line, which mail clients would collapse.
      return `<p>${inner() || "<br>"}</p>`;
    }
    const tag = FORMAT_TAGS[el.tagName];
    return tag ? `<${tag}>${inner()}</${tag}>` : inner();
  };
  return Array.from(parse(html).childNodes).map(serialize).join("");
};

/** Plain-text alternative: lists and quotes keep their markers, links their target. */
export const bodyToText = (html: string): string => {
  const linkText = (el: Element) => {
    const label = el.textContent ?? "";
    const href = safeHref(el.getAttribute("href"));
    if (!href) return label;
    const bare = href.replace(/^mailto:/i, "");
    return label === href || label === bare ? label : `${label} (${href})`;
  };

  const linesOf = (parent: Node): string[] => {
    const lines: string[] = [];
    let current = "";
    let open = false;
    const flush = () => {
      if (open) lines.push(current);
      current = "";
      open = false;
    };

    const inline = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parts = (node.textContent ?? "").split("\n");
        parts.forEach((part, i) => {
          if (i > 0) {
            lines.push(current);
            current = "";
          }
          if (part) {
            current += part;
            open = true;
          }
        });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      if (SKIPPED_TAGS.has(el.tagName)) return;
      if (el.tagName === "BR") {
        lines.push(current);
        current = "";
        open = false;
        return;
      }
      if (el.tagName === "A") {
        current += linkText(el);
        open = true;
        return;
      }
      if (BLOCK_TAGS.has(el.tagName)) {
        flush();
        lines.push(...blockLines(el));
        return;
      }
      el.childNodes.forEach(inline);
    };

    parent.childNodes.forEach(inline);
    flush();
    return lines;
  };

  const blockLines = (el: Element): string[] => {
    const inner = linesOf(el);
    switch (el.tagName) {
      case "UL":
      case "OL":
        return Array.from(el.children).flatMap((li, index) => {
          const marker = el.tagName === "OL" ? `${index + 1}. ` : "- ";
          const itemLines = blockLines(li);
          return itemLines.map((line, i) =>
            i === 0 ? marker + line : " ".repeat(marker.length) + line,
          );
        });
      case "BLOCKQUOTE":
        return inner.map((line) => (line ? `> ${line}` : ">"));
      default:
        // A paragraph with no content is a blank line.
        return inner.length > 0 ? inner : [""];
    }
  };

  const lines = linesOf(parse(html));
  // The line break a browser keeps at the end of a block is not a blank line.
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
};

/** Editor HTML for a plain-text body (the quoted original of a reply). */
export const textToBody = (text: string): string =>
  text
    .split(/\r?\n/)
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<p></p>"))
    .join("");
