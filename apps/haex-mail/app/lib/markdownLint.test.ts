import { describe, expect, it } from "vitest";
import { lintMarkdown } from "./markdownLint";

const codes = (md: string) => lintMarkdown(md).map((i) => `${i.line}:${i.code}`);

describe("lintMarkdown", () => {
  it("has nothing to say about plain Markdown the editor handles", () => {
    expect(
      codes(
        "# Title\n\nSome **bold** and *italic* with `code`, <u>under</u> and [a link](https://example.com).\n\n" +
          "- one\n- two\n\n> quote\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\n| not | a table\n![x](y)\n```\n\n" +
          "See <https://example.com> or <me@example.com> and https://bare.example",
      ),
    ).toEqual([]);
  });

  it("flags images, which are not embedded", () => {
    expect(codes("a\n![logo](https://x/y.png)")).toEqual(["2:image"]);
  });

  it("flags links that are not sent as links", () => {
    expect(codes("[a](javascript:alert(1))")).toEqual(["1:linkScheme"]);
    expect(lintMarkdown("[a](javascript:alert(1))")[0]!.params).toEqual({ url: "javascript:alert(1)" });
    expect(codes("[w](https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual([]);
    expect(codes("[a](page.html) [b](www.example.com) [c]()")).toEqual([
      "1:linkScheme",
      "1:linkScheme",
      "1:linkEmpty",
    ]);
    expect(codes("[ok](mailto:a@example.com) [ok](https://example.com 'title')")).toEqual([]);
    expect(lintMarkdown("[a](ftp://h/x)")[0]!.params).toEqual({ url: "ftp://h/x" });
  });

  it("flags a space between the link text and its address", () => {
    expect(codes("[text] (https://example.com)")).toEqual(["1:linkSpace"]);
  });

  it("flags headings deeper than three levels and a missing space", () => {
    expect(codes("#### four\n### three\n#hashtag")).toEqual(["1:headingDeep", "3:headingSpace"]);
    expect(lintMarkdown("#hashtag")[0]!.severity).toBe("info");
  });

  it("flags HTML the editor does not take, but not underline, breaks or autolinks", () => {
    expect(codes("<div>x</div>")).toEqual(["1:html"]);
    expect(lintMarkdown("<div class=\"a\">x</div>")[0]!.params).toEqual({ tag: "<div>" });
    expect(codes("<b>x</b> <i>y</i>")).toEqual(["1:html", "1:html"]);
    expect(codes("a<br>b <u>c</u> <https://x.y> <a@b.c>")).toEqual([]);
  });

  it("notes task items, which are sent as a marker", () => {
    expect(lintMarkdown("- [ ] todo")).toEqual([
      { line: 1, code: "task", severity: "info", params: {} },
    ]);
  });

  it("flags emphasis and strikethrough left open within a paragraph", () => {
    expect(codes("fine **ok**\n\nopen **bold\n\n~~gone")).toEqual(["3:emphasisOpen", "5:strikeOpen"]);
    expect(codes("spans\nlines **bold\nstill** bold")).toEqual([]);
    expect(codes("`**` in code")).toEqual([]);
  });

  it("flags table rows with the wrong number of cells", () => {
    expect(codes("| a | b |\n|---|---|\n| 1 | 2 | 3 |\n| 1 |\n| ok | ok |")).toEqual([
      "3:tableColumns",
      "4:tableColumns",
    ]);
    expect(lintMarkdown("| a | b |\n|---|---|\n| 1 |")[0]!.params).toEqual({ found: 1, expected: 2 });
  });

  it("flags a code fence that is never closed", () => {
    expect(codes("text\n\n```\ncode")).toEqual(["3:fenceOpen"]);
  });

  it("orders hints by line", () => {
    expect(codes("![i](x)\n\n#### h\n\n[a](x.html)")).toEqual(["1:image", "3:headingDeep", "5:linkScheme"]);
  });
});
