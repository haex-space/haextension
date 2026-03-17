<script setup lang="ts">
import type { EditorTab } from "~/types";

const props = defineProps<{
  tab: EditorTab;
}>();

const emit = defineEmits<{
  "update:content": [content: string];
  save: [];
}>();

const editorContainer = ref<HTMLElement | null>(null);
const editorInstance = shallowRef<any>(null);

const initEditor = async () => {
  if (!editorContainer.value) return;

  const monaco = await import("monaco-editor");

  editorInstance.value = monaco.editor.create(editorContainer.value, {
    value: props.tab.content,
    language: props.tab.language,
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    tabSize: 2,
    scrollBeyondLastLine: false,
    wordWrap: "off",
    lineNumbers: "on",
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
};

watch(
  () => props.tab.path,
  async () => {
    if (editorInstance.value) {
      const monaco = await import("monaco-editor");
      const model = monaco.editor.createModel(
        props.tab.content,
        props.tab.language
      );
      editorInstance.value.setModel(model);
    }
  }
);

onMounted(initEditor);

onUnmounted(() => {
  editorInstance.value?.dispose();
});
</script>

<template>
  <div ref="editorContainer" class="h-full w-full" />
</template>
