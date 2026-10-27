export type NotebookShortcut = "save" | "undo" | "redo";

type ShortcutEvent = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "target">;

const TEXT_INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Eingabefelder haben eigene Kürzel (z.B. Undo im Text) und behalten sie. */
function isTextInput(target: EventTarget | null): boolean {
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!element) return false;
  return element.isContentEditable === true
    || (typeof element.tagName === "string" && TEXT_INPUT_TAGS.has(element.tagName));
}

/** Tastenkürzel der Notizbuch-Seite, oder null, wenn der Tastendruck keines ist. */
export function notebookShortcut(e: ShortcutEvent): NotebookShortcut | null {
  if (!(e.ctrlKey || e.metaKey) || isTextInput(e.target)) return null;
  // Mit Shift oder Feststelltaste kommt der Großbuchstabe an.
  const key = e.key.toLowerCase();
  if (key === "s") return "save";
  if (key === "y" || (key === "z" && e.shiftKey)) return "redo";
  if (key === "z") return "undo";
  return null;
}

/** Entfernen oder Rückschritt außerhalb eines Eingabefelds löscht das ausgewählte Element. */
export function isDeleteKey(e: ShortcutEvent): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isTextInput(e.target)) return false;
  return e.key === "Delete" || e.key === "Backspace";
}
