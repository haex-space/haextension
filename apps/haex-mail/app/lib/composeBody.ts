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
  H1: "h1",
  H2: "h2",
  H3: "h3",
  CODE: "code",
  PRE: "pre",
};

/** Block-level tags a line break is implied around. */
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "H1",
  "H2",
  "H3",
  "TABLE",
]);

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
  if (
    root.querySelector(
      "strong, b, em, i, u, s, strike, del, ul, ol, blockquote, h1, h2, h3, code, pre, hr, table",
    )
  ) {
    return true;
  }
  return Array.from(root.querySelectorAll("a")).some((a) =>
    safeHref(a.getAttribute("href")),
  );
};

// Mail clients ignore style sheets, so a table carries its look inline.
const TABLE_STYLE = "border-collapse:collapse";
const CELL_STYLE = "border:1px solid #bbb;padding:4px 8px;text-align:left;vertical-align:top";
const HEADER_CELL_STYLE = `${CELL_STYLE};background:#f2f2f2;font-weight:bold`;

/** Outgoing HTML: escaped text, paragraphs, line breaks, formatting and safe links only. */
export const bodyToHtml = (html: string): string => {
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    if (SKIPPED_TAGS.has(el.tagName)) return "";
    const inner = () => Array.from(el.childNodes).map(serialize).join("");
    if (el.tagName === "BR") return "<br>";
    if (el.tagName === "HR") return "<hr>";
    if (el.tagName === "A") {
      const href = safeHref(el.getAttribute("href"));
      return href ? `<a href="${escapeHtml(href)}">${inner()}</a>` : inner();
    }
    if (el.tagName === "TABLE") {
      const rows = Array.from(el.querySelectorAll("tr")).map(serialize).join("");
      return `<table style="${TABLE_STYLE}">${rows}</table>`;
    }
    if (el.tagName === "TR") return `<tr>${inner()}</tr>`;
    if (el.tagName === "TH" || el.tagName === "TD") {
      const tag = el.tagName.toLowerCase();
      // A cell holds paragraphs in the editor; mail clients want them as lines.
      const content = Array.from(el.childNodes)
        .map((child) =>
          child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === "P"
            ? Array.from(child.childNodes).map(serialize).join("")
            : serialize(child),
        )
        .join("<br>");
      return `<${tag} style="${tag === "th" ? HEADER_CELL_STYLE : CELL_STYLE}">${content}</${tag}>`;
    }
    if (el.tagName === "P" || el.tagName === "DIV") {
      // An empty paragraph is a blank line, which mail clients would collapse.
      return `<p>${inner() || "<br>"}</p>`;
    }
    const tag = FORMAT_TAGS[el.tagName];
    return tag ? `<${tag}>${inner()}</${tag}>` : inner();
  };
  return Array.from(parse(html).childNodes)
    .map(serialize)
    .join("")
    // The editor keeps an empty paragraph after a list or table; that is no blank line.
    .replace(/(<p><br><\/p>)+$/, "");
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
      if (el.tagName === "HR") {
        flush();
        lines.push("---");
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
      case "TABLE":
        return Array.from(el.querySelectorAll("tr")).map((row) =>
          Array.from(row.children)
            .map((cell) => linesOf(cell).join(" "))
            .join(" | "),
        );
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

/**
 * Markdown the editor cannot represent would drop its content when parsed, so
 * a task item becomes a ☐/☑ text marker.
 */
export const markdownForEditor = (markdown: string): string => {
  let inFence = false;
  return markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      return inFence
        ? line
        : line.replace(
            /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s/,
            (_, lead, mark) => `${lead}${mark === " " ? "☐" : "☑"} `,
          );
    })
    .join("\n");
};
