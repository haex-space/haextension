<script setup lang="ts">
import type { EditorTab } from "~/types";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

const props = defineProps<{
  tab: EditorTab;
}>();

const emit = defineEmits<{
  "update:content": [content: string];
  save: [];
}>();

const settings = useSettingsStore();
const gitStore = useGitStore();
const workspace = useWorkspaceStore();
const { getHeadContent } = useGit();

const editorContainer = ref<HTMLElement | null>(null);
const editorInstance = shallowRef<any>(null);
const gutterDecorations = shallowRef<any>(null);

const updateGutterDecorations = async () => {
  const editor = editorInstance.value;
  if (!editor || !gitStore.isRepo || !workspace.rootPath) return;

  const headContent = await getHeadContent(workspace.rootPath, props.tab.path.slice(workspace.rootPath.length + 1));
  if (headContent === null) {
    gutterDecorations.value?.clear();
    return;
  }

  const changes = computeLineChanges(headContent, props.tab.content);
  const decorations = changes.map(({ line, type }) => ({
    range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
    options: {
      isWholeLine: true,
      linesDecorationsClassName: `git-gutter-${type}`,
      className: `git-line-${type}`,
    },
  }));

  if (!gutterDecorations.value) {
    gutterDecorations.value = editor.createDecorationsCollection(decorations);
  } else {
    gutterDecorations.value.set(decorations);
  }
};

const initEditor = async () => {
  if (!editorContainer.value) return;

  if (!window.MonacoEnvironment) {
    window.MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        if (label === "typescript" || label === "javascript") return new TsWorker();
        if (label === "json") return new JsonWorker();
        if (label === "css" || label === "scss" || label === "less") return new CssWorker();
        if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
        return new EditorWorker();
      },
    };
  }

  const monaco = await import("monaco-editor");

  editorInstance.value = monaco.editor.create(editorContainer.value, {
    value: props.tab.content,
    language: props.tab.language,
    theme: settings.editorTheme,
    automaticLayout: true,
    minimap: { enabled: settings.editorMinimap },
    fontSize: settings.editorFontSize,
    fontFamily: settings.editorFontFamily,
    tabSize: settings.editorTabSize,
    scrollBeyondLastLine: false,
    wordWrap: settings.editorWordWrap,
    lineNumbers: settings.editorLineNumbers,
    renderWhitespace: "selection",
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
    padding: { top: 8, bottom: 8 },
    smoothScrolling: true,
    cursorSmoothCaretAnimation: "on",
  });

  editorInstance.value.onDidChangeModelContent(() => {
    emit("update:content", editorInstance.value.getValue());
  });

  editorInstance.value.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
    () => emit("save")
  );

  updateGutterDecorations();
};

// Reactively apply settings changes to the editor
watch(
  () => ({
    theme: settings.editorTheme,
    fontSize: settings.editorFontSize,
    fontFamily: settings.editorFontFamily,
    tabSize: settings.editorTabSize,
    wordWrap: settings.editorWordWrap,
    minimap: settings.editorMinimap,
    lineNumbers: settings.editorLineNumbers,
  }),
  async (newSettings) => {
    if (!editorInstance.value) return;
    const monaco = await import("monaco-editor");
    monaco.editor.setTheme(newSettings.theme);
    editorInstance.value.updateOptions({
      fontSize: newSettings.fontSize,
      fontFamily: newSettings.fontFamily,
      tabSize: newSettings.tabSize,
      wordWrap: newSettings.wordWrap,
      minimap: { enabled: newSettings.minimap },
      lineNumbers: newSettings.lineNumbers,
    });
  },
  { deep: true }
);

watch(
  () => props.tab.path,
  async () => {
    if (editorInstance.value) {
      gutterDecorations.value?.clear();
      gutterDecorations.value = null;
      const monaco = await import("monaco-editor");
      const model = monaco.editor.createModel(props.tab.content, props.tab.language);
      editorInstance.value.setModel(model);
      updateGutterDecorations();
    }
  }
);

// Re-run decorations when the file is saved (status may change) or git refreshes
watch(() => gitStore.statusMap, updateGutterDecorations, { deep: true });

onMounted(initEditor);

onUnmounted(() => {
  gutterDecorations.value?.clear();
  editorInstance.value?.dispose();
});
</script>

<template>
  <div ref="editorContainer" class="h-full w-full" />
</template>

<style>
.git-gutter-added { background: #2ea04326; border-left: 3px solid #2ea043; margin-left: 3px; }
.git-gutter-modified { background: #d2930026; border-left: 3px solid #d29300; margin-left: 3px; }
.git-gutter-deleted { background: transparent; border-left: 3px solid #f8514980; margin-left: 3px; }
</style>
