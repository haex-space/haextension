// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bodyNeedsHtml, bodyToHtml, bodyToText, safeHref, textToBody } from "./composeBody";

describe("safeHref", () => {
  it("accepts absolute http(s) and mailto URLs only", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
    for (const href of ["javascript:alert(1)", "file:///etc/passwd", "/relative", "", null]) {
      expect(safeHref(href)).toBeUndefined();
    }
  });
});

describe("bodyToText", () => {
  it("reads a line per paragraph, an empty paragraph being a blank line", () => {
    expect(bodyToText("<p>a</p><p></p><p>b<br>c</p>")).toBe("a\n\nb\nc");
  });

  it("reads lines from bare br and div content", () => {
    expect(bodyToText("a<br>b<div>c</div><div><br></div><div>d</div>")).toBe(
      "a\nb\nc\n\nd",
    );
  });

  it("drops the break a browser keeps at the end", () => {
    expect(bodyToText("hello<br>")).toBe("hello");
  });

  it("keeps the target of a link with a different label visible", () => {
    expect(bodyToText('<p>see <a href="https://example.com">the docs</a>!</p>')).toBe(
      "see the docs (https://example.com)!",
    );
  });

  it("does not repeat a link that is its own label", () => {
    expect(
      bodyToText('<p><a href="https://example.com">https://example.com</a></p>'),
    ).toBe("https://example.com");
  });

  it("writes lists with markers and quotes with a prefix", () => {
    expect(
      bodyToText(
        "<ul><li><p>one</p></li><li><p>two</p></li></ul>" +
          "<ol><li><p>first</p></li><li><p>second</p></li></ol>" +
          "<blockquote><p>quoted</p><p>more</p></blockquote>",
      ),
    ).toBe("- one\n- two\n1. first\n2. second\n> quoted\n> more");
  });

  it("indents nested lists under their item", () => {
    expect(
      bodyToText("<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>"),
    ).toBe("- a\n  - b");
  });

  it("drops formatting tags, unsafe links and scripts but keeps their text", () => {
    expect(
      bodyToText(
        '<p><strong>bo</strong>ld <a href="javascript:alert(1)">x</a></p><script>alert(1)</script>',
      ),
    ).toBe("bold x");
  });
});

describe("bodyToHtml", () => {
  it("keeps paragraphs, formatting, lists, quotes and safe links", () => {
    const html =
      '<p>a <strong>b</strong> <em>c</em> <u>d</u> <s>e</s></p><ul><li><p>x</p></li></ul>' +
      '<blockquote><p>q</p></blockquote><p><a href="https://example.com/?a=1&amp;b=2">go</a></p>';
    expect(bodyToHtml(html)).toBe(html);
  });

  it("escapes text and turns an empty paragraph into a visible blank line", () => {
    expect(bodyToHtml("<p>1 &lt; 2 &amp; 3</p><p></p>")).toBe(
      "<p>1 &lt; 2 &amp; 3</p><p><br></p>",
    );
  });

  it("strips scripts, attributes and unsafe links", () => {
    expect(
      bodyToHtml(
        '<p><a href="javascript:alert(1)" onclick="x()">t</a><script>alert(1)</script><span style="color:red">s</span></p>',
      ),
    ).toBe("<p>ts</p>");
  });

  it("normalises alternative tags", () => {
    expect(bodyToHtml("<p><b>a</b><i>b</i><del>c</del></p>")).toBe(
      "<p><strong>a</strong><em>b</em><s>c</s></p>",
    );
  });
});

describe("bodyNeedsHtml", () => {
  it("is false for plain paragraphs and line breaks", () => {
    expect(bodyNeedsHtml("<p>plain</p><p></p><p>text<br>more</p>")).toBe(false);
    expect(bodyNeedsHtml('<a href="javascript:alert(1)">x</a>')).toBe(false);
  });

  it("is true once there is formatting, a list, a quote or a link", () => {
    for (const html of [
      "<p><strong>x</strong></p>",
      "<p><em>x</em></p>",
      "<ul><li>x</li></ul>",
      "<blockquote>x</blockquote>",
      '<p><a href="https://example.com">x</a></p>',
    ]) {
      expect(bodyNeedsHtml(html)).toBe(true);
    }
  });
});

describe("textToBody", () => {
  it("round-trips plain text, markup characters and blank lines included", () => {
    const text = "> quoted <b>\n\nA & B";
    expect(bodyToText(textToBody(text))).toBe(text);
  });
});
