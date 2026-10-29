// Hints for the Markdown source in the compose editor. The rules are not about
// style: each one flags something the editor or the mail cannot show the way
// it is written, so the writer sees it before the mail goes out.

import { safeHref } from "./composeBody";

export type LintCode =
  | "image"
  | "linkEmpty"
  | "linkScheme"
  | "linkSpace"
  | "headingDeep"
  | "headingSpace"
  | "html"
  | "task"
  | "emphasisOpen"
  | "strikeOpen"
  | "tableColumns"
  | "fenceOpen";

export interface LintIssue {
  /** 1-based line the hint belongs to. */
  line: number;
  code: LintCode;
  /** `info` is only a note on how something is sent, `warning` means it is not sent as written. */
  severity: "info" | "warning";
  params: Record<string, string | number>;
}

/** Tags the editor understands inside Markdown (underline, line break). */
const ALLOWED_TAGS = new Set(["u", "br"]);

const blank = (text: string) => text.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));

const countOf = (text: string, needle: string) => text.split(needle).length - 1;

const cellsOf = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/).length;

const isTableSeparator = (line: string) =>
  line.includes("|") && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

export const lintMarkdown = (source: string): LintIssue[] => {
  const issues: LintIssue[] = [];
  const add = (
    line: number,
    code: LintCode,
    severity: LintIssue["severity"],
    params: LintIssue["params"] = {},
  ) => issues.push({ line, code, severity, params });

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  // Lines outside code fences, with inline code blanked out so its content is not judged.
  const prose: (string | null)[] = [];
  let fenceStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) {
      fenceStart = fenceStart ? 0 : i + 1;
      prose.push(null);
    } else {
      prose.push(fenceStart ? null : blank(line));
    }
  }
  if (fenceStart) add(fenceStart, "fenceOpen", "warning");

  prose.forEach((text, i) => {
    if (text === null) return;
    const n = i + 1;

    if (/!\[[^\]]*\]\([^)]*\)/.test(text)) add(n, "image", "warning");

    // The address may hold one level of parentheses, as in a Wikipedia URL.
    for (const m of text.matchAll(/(?<!!)\[[^\]]*\]\(\s*((?:[^()\s]|\([^()]*\))*)[^)]*\)/g)) {
      const url = m[1] ?? "";
      if (!url) add(n, "linkEmpty", "warning");
      else if (!safeHref(url)) add(n, "linkScheme", "warning", { url });
    }
    if (/\]\s+\(\S/.test(text)) add(n, "linkSpace", "warning");

    const heading = /^(#+)(\s|$)/.exec(text);
    if (heading && heading[1]!.length > 3) {
      add(n, "headingDeep", "warning", { level: heading[1]!.length });
    } else if (/^#{1,6}[^#\s]/.test(text)) {
      add(n, "headingSpace", "info");
    }

    // Once per tag name and line, so an opening and its closing tag are one hint.
    const seen = new Set<string>();
    for (const m of text.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)(?=[\s>/])[^>]*>/g)) {
      const name = m[1]!.toLowerCase();
      if (ALLOWED_TAGS.has(name) || seen.has(name)) continue;
      seen.add(name);
      add(n, "html", "warning", { tag: `<${name}>` });
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s/.test(text)) add(n, "task", "info");
  });

  // Emphasis must close within its paragraph.
  let blockStart = -1;
  const blockLines: string[] = [];
  const closeBlock = () => {
    if (blockStart < 0) return;
    const text = blockLines.join("\n");
    if (countOf(text, "**") % 2) add(blockStart + 1, "emphasisOpen", "warning");
    if (countOf(text, "~~") % 2) add(blockStart + 1, "strikeOpen", "warning");
    blockStart = -1;
    blockLines.length = 0;
  };
  prose.forEach((text, i) => {
    if (text === null || !text.trim()) return closeBlock();
    if (blockStart < 0) blockStart = i;
    blockLines.push(text);
  });
  closeBlock();

  // Every row of a table needs as many cells as its header.
  for (let i = 0; i + 1 < prose.length; i++) {
    const head = prose[i];
    const sep = prose[i + 1];
    if (head == null || sep == null || !head.includes("|") || !isTableSeparator(sep)) continue;
    const expected = cellsOf(head);
    let j = i + 2;
    for (; j < prose.length; j++) {
      const row = prose[j];
      if (row == null || !row.includes("|") || !row.trim()) break;
      const found = cellsOf(row);
      if (found !== expected) add(j + 1, "tableColumns", "warning", { found, expected });
    }
    i = j - 1;
  }

  return issues.sort((a, b) => a.line - b.line);
};
