import { describe, expect, it } from "vitest";
import { notebookShortcut } from "./shortcuts";

const key = (k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}, target: unknown = null) => ({
  key: k,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  target: target as EventTarget | null,
});

describe("notebookShortcut", () => {
  it("maps save, undo and redo", () => {
    expect(notebookShortcut(key("s", { ctrl: true }))).toBe("save");
    expect(notebookShortcut(key("z", { ctrl: true }))).toBe("undo");
    expect(notebookShortcut(key("y", { ctrl: true }))).toBe("redo");
    expect(notebookShortcut(key("z", { meta: true }))).toBe("undo");
  });

  it("recognises Ctrl+Shift+Z, where the key arrives upper case", () => {
    expect(notebookShortcut(key("Z", { ctrl: true, shift: true }))).toBe("redo");
  });

  it("still undoes with caps lock on", () => {
    expect(notebookShortcut(key("Z", { ctrl: true }))).toBe("undo");
  });

  it("ignores keys without a modifier", () => {
    expect(notebookShortcut(key("z"))).toBeNull();
  });

  it("leaves shortcuts to text fields that have the focus", () => {
    expect(notebookShortcut(key("z", { ctrl: true }, { tagName: "INPUT" }))).toBeNull();
    expect(notebookShortcut(key("z", { ctrl: true }, { tagName: "DIV", isContentEditable: true }))).toBeNull();
    expect(notebookShortcut(key("z", { ctrl: true }, { tagName: "CANVAS" }))).toBe("undo");
  });
});
