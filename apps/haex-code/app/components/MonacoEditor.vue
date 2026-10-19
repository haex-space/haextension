<script setup lang="ts">
import type * as Monaco from "monaco-editor";
import type { EditorTab } from "~/types";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import { computeLineChanges } from "~/lib/lineChanges";
import { relativePath } from "~/lib/path";

const props = defineProps<{
  tab: EditorTab;
}>();

const emit = defineEmits<{
  "update:content": [tabId: string, content: string];
  save: [];
}>();

const settings = useSettingsStore();
const gitStore = useGitStore();
const workspace = useWorkspaceStore();
const editorStore = useEditorStore();
const { getHeadContent } = useGit();

const editorContainer = ref<HTMLElement | null>(null);
const editorInstance = shallowRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
const gutterDecorations = shallowRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

// One model per tab keeps undo history and view state across tab switches.
// The models are owned here (Monaco only disposes models it created itself).
let monacoApi: typeof Monaco | null = null;
const models = new Map<string, Monaco.editor.ITextModel>();
const viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
let shownTabId: string | null = null;
let unmounted = false;
// Set while the store's content is written into a model, so that write is not echoed back as an edit.
let applyingStoreContent = false;

const modelFor = (monaco: typeof Monaco, tab: EditorTab): Monaco.editor.ITextModel => {
  let model = models.get(tab.id);
  if (!model) {
    model = monaco.editor.createModel(tab.content, tab.language);
    models.set(tab.id, model);
  }
  return model;
};

/** Takes over content that changed in the store without an edit in this editor (e.g. a reload). */
const syncModelWithTab = (model: Monaco.editor.ITextModel, tab: EditorTab) => {
  if (model.getValue() === tab.content) return;
  applyingStoreContent = true;
  try {
    model.setValue(tab.content);
  } finally {
    applyingStoreContent = false;
  }
};

const updateGutterDecorations = async () => {
  const editor = editorInstance.value;
  const root = workspace.rootPath;
  const tab = props.tab;
  if (!editor || !gitStore.isRepo || !root) return;

  // Untitled tabs and files outside the opened folder have no HEAD version to compare with.
  const pathInRepo = relativePath(root, tab.path);
  const headContent = pathInRepo === null ? null : await getHeadContent(root, pathInRepo);
  // Another tab may have been shown while git was running.
  if (editorInstance.value !== editor || shownTabId !== tab.id) return;
  if (headContent === null) {
    gutterDecorations.value?.clear();
    return;
  }

  const changes = computeLineChanges(headContent, tab.content);
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

const showTab = (tab: EditorTab) => {
  const editor = editorInstance.value;
  if (!editor || !monacoApi) return;
  if (shownTabId && models.has(shownTabId)) viewStates.set(shownTabId, editor.saveViewState());
  gutterDecorations.value?.clear();
  gutterDecorations.value = null;
  const model = modelFor(monacoApi, tab);
  syncModelWithTab(model, tab);
  editor.setModel(model);
  const viewState = viewStates.get(tab.id);
  if (viewState) editor.restoreViewState(viewState);
  shownTabId = tab.id;
  void updateGutterDecorations();
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
  if (unmounted || !editorContainer.value) return;
  monacoApi = monaco;

  const editor = monaco.editor.create(editorContainer.value, {
    model: modelFor(monaco, props.tab),
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
  editorInstance.value = editor;
  shownTabId = props.tab.id;

  editor.onDidChangeModelContent(() => {
    if (shownTabId && !applyingStoreContent) emit("update:content", shownTabId, editor.getValue());
  });

  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
    () => emit("save")
  );

  void updateGutterDecorations();
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
  (newSettings) => {
    if (!editorInstance.value || !monacoApi) return;
    monacoApi.editor.setTheme(newSettings.theme);
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
  () => props.tab.id,
  () => showTab(props.tab)
);

watch(
  () => props.tab.content,
  () => {
    const model = models.get(props.tab.id);
    if (model) syncModelWithTab(model, props.tab);
  }
);

// Saving an untitled tab gives it a file name and with that a language.
watch(
  () => props.tab.language,
  (language) => {
    const model = models.get(props.tab.id);
    if (model && monacoApi) monacoApi.editor.setModelLanguage(model, language);
  }
);

watch(
  () => editorStore.tabs.map((t) => t.id),
  (openIds) => {
    for (const [tabId, model] of models) {
      if (openIds.includes(tabId)) continue;
      model.dispose();
      models.delete(tabId);
      viewStates.delete(tabId);
    }
  }
);

// Re-run decorations when the file is saved (status may change) or git refreshes
watch(() => gitStore.statusMap, updateGutterDecorations, { deep: true });

onMounted(initEditor);

onUnmounted(() => {
  unmounted = true;
  gutterDecorations.value?.clear();
  editorInstance.value?.dispose();
  for (const model of models.values()) model.dispose();
  models.clear();
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
