<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { Annotation, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { LintIssue } from "~/lib/markdownLint";

/**
 * Markdown source editor (CodeMirror 6): syntax colouring, list continuation on
 * Enter, its own undo history, and the lint hints marked in the text. The
 * colours come from the app's theme tokens, so it follows light and dark.
 */
const model = defineModel<string>({ default: "" });

const props = defineProps<{
  placeholder?: string;
  ariaLabel?: string;
  issues: LintIssue[];
  /** The text of a hint in the current language. */
  describe: (issue: LintIssue) => string;
}>();

const host = ref<HTMLDivElement>();
// Not reactive: the view is a mutable object that Vue must not proxy.
let view: EditorView | undefined;

/** Marks changes that come from the model, so they are not echoed back. */
const fromModel = Annotation.define<boolean>();

const muted = "color-mix(in srgb, currentColor 50%, transparent)";
const accent = "var(--color-primary, #2563eb)";

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600", color: accent },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: accent },
  { tag: tags.monospace, backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)" },
  { tag: tags.quote, color: muted },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.list], color: muted },
  { tag: tags.comment, color: muted },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "0.875rem", backgroundColor: "transparent", color: "inherit" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "ui-monospace, monospace", lineHeight: "1.6", overflow: "auto" },
  ".cm-content": { padding: "1rem 0", caretColor: "currentColor" },
  ".cm-line": { padding: "0 1rem 0 0.5rem" },
  ".cm-cursor": { borderLeftColor: "currentColor" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: muted },
  ".cm-placeholder": { color: muted },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "color-mix(in srgb, var(--color-primary, #2563eb) 25%, transparent)" },
  ".cm-tooltip": {
    backgroundColor: "var(--color-popover, #fff)",
    color: "var(--color-popover-foreground, #111)",
    border: "1px solid var(--color-border, #d4d4d8)",
    borderRadius: "0.375rem",
  },
});

const pushDiagnostics = () => {
  if (!view) return;
  const doc = view.state.doc;
  const diagnostics: Diagnostic[] = props.issues
    .filter((issue) => issue.line >= 1 && issue.line <= doc.lines)
    .map((issue) => {
      const line = doc.line(issue.line);
      return {
        from: line.from,
        to: line.to,
        severity: issue.severity === "info" ? "info" : "warning",
        message: props.describe(issue),
      };
    });
  view.dispatch(setDiagnostics(view.state, diagnostics));
};

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: model.value,
      extensions: [
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(highlight),
        EditorView.lineWrapping,
        lintGutter(),
        placeholderExtension(props.placeholder ?? ""),
        EditorView.contentAttributes.of({
          "aria-label": props.ariaLabel ?? "",
          spellcheck: "false",
        }),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromModel))) {
            model.value = update.state.doc.toString();
          }
        }),
      ],
    }),
  });
  pushDiagnostics();
});

onBeforeUnmount(() => view?.destroy());

watch(model, (value) => {
  if (!view || view.state.doc.toString() === value) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    annotations: fromModel.of(true),
  });
  pushDiagnostics();
});

watch(() => props.issues, pushDiagnostics);

defineExpose({
  focus: () => view?.focus(),
  undo: () => {
    if (!view) return;
    view.focus();
    undo(view);
  },
  redo: () => {
    if (!view) return;
    view.focus();
    redo(view);
  },
  /** Replaces the selection (or inserts at the cursor) and keeps the focus in the editor. */
  insertText: (text: string) => {
    if (!view) return;
    view.dispatch({ ...view.state.replaceSelection(text), scrollIntoView: true, userEvent: "input" });
    view.focus();
  },
  /** Selects a 1-based line and scrolls it into view. */
  goToLine: (lineNumber: number) => {
    if (!view) return;
    const line = view.state.doc.line(Math.min(Math.max(lineNumber, 1), view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
  },
});
</script>

<template>
  <div ref="host" class="markdown-source min-h-0 min-w-0 overflow-hidden" />
</template>

<style scoped>
.markdown-source :deep(.cm-editor) {
  height: 100%;
}
</style>
