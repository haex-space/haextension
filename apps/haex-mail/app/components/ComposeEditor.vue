<script setup lang="ts">
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "@lucide/vue";
import type { Component } from "vue";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { safeHref } from "~/lib/composeBody";

/**
 * Rich-text editor for the message body. The model is the editor's HTML;
 * `~/lib/composeBody` turns it into the text and HTML that get sent.
 * Undo/redo and the usual shortcuts (Ctrl+B/I/U, Ctrl+Z, Ctrl+Shift+Z or
 * Ctrl+Y) come from TipTap; a link pasted over selected text links it.
 */
const model = defineModel<string>({ default: "" });

const props = defineProps<{ placeholder?: string }>();

const { t } = useI18n();

const editor = useEditor({
  content: model.value,
  extensions: [
    StarterKit.configure({
      heading: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: { openOnClick: false, defaultProtocol: "https" },
    }),
  ],
  editorProps: {
    attributes: {
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": props.placeholder ?? "",
      class: "compose-editor px-4 py-4 text-sm focus:outline-none",
    },
  },
  onUpdate: ({ editor }) => {
    model.value = editor.getHTML();
  },
});

// External changes (a reply triggered while the dialog is open) replace the
// content; the editor's own updates are already in sync.
watch(model, (html) => {
  if (editor.value && editor.value.getHTML() !== html) {
    editor.value.commands.setContent(html, { emitUpdate: false });
  }
});

const active = (name: string) => !!editor.value?.isActive(name);

// Inline link editor: `prompt()` is unreliable in the webview.
const linkOpen = ref(false);
const linkUrl = ref("");
const linkInput = ref<{ $el?: HTMLElement } | null>(null);

const openLink = () => {
  if (!editor.value) return;
  linkUrl.value = editor.value.getAttributes("link").href ?? "";
  linkOpen.value = true;
  nextTick(() =>
    (linkInput.value?.$el?.querySelector("input") ?? linkInput.value?.$el)?.focus?.(),
  );
};

const closeLink = () => {
  linkOpen.value = false;
  editor.value?.commands.focus();
};

const applyLink = () => {
  const raw = linkUrl.value.trim();
  if (!raw) {
    removeLink();
    return;
  }
  // A bare address such as "example.com" is meant as an https link.
  const href = safeHref(raw) ?? safeHref(`https://${raw}`);
  if (!href) return;
  editor.value?.chain().focus().extendMarkRange("link").setLink({ href }).run();
  linkOpen.value = false;
};

const removeLink = () => {
  editor.value?.chain().focus().extendMarkRange("link").unsetLink().run();
  linkOpen.value = false;
};

const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openLink();
  }
};

const isEmpty = computed(() => !editor.value || editor.value.isEmpty);

interface Tool {
  key: string;
  icon: Component;
  on: boolean;
  disabled?: boolean;
  run: () => void;
}

const tools = computed<Tool[][]>(() => {
  const e = editor.value;
  return [
    [
      { key: "undo", icon: Undo2, on: false, disabled: !e?.can().undo(), run: () => void e?.chain().focus().undo().run() },
      { key: "redo", icon: Redo2, on: false, disabled: !e?.can().redo(), run: () => void e?.chain().focus().redo().run() },
    ],
    [
      { key: "bold", icon: Bold, on: active("bold"), run: () => e?.chain().focus().toggleBold().run() },
      { key: "italic", icon: Italic, on: active("italic"), run: () => e?.chain().focus().toggleItalic().run() },
      { key: "underline", icon: Underline, on: active("underline"), run: () => e?.chain().focus().toggleUnderline().run() },
      { key: "strike", icon: Strikethrough, on: active("strike"), run: () => e?.chain().focus().toggleStrike().run() },
    ],
    [
      { key: "bulletList", icon: List, on: active("bulletList"), run: () => e?.chain().focus().toggleBulletList().run() },
      { key: "orderedList", icon: ListOrdered, on: active("orderedList"), run: () => e?.chain().focus().toggleOrderedList().run() },
      { key: "blockquote", icon: Quote, on: active("blockquote"), run: () => e?.chain().focus().toggleBlockquote().run() },
    ],
    [{ key: "link", icon: Link2, on: active("link"), run: openLink }],
  ];
});
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0" @keydown="onKeydown">
    <div class="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 border-b border-border">
      <div v-for="(group, i) in tools" :key="i" class="flex items-center gap-1">
        <!-- mousedown would move focus (and the selection) out of the editor -->
        <UiButton
          v-for="tool in group"
          :key="tool.key"
          type="button"
          :variant="tool.on ? 'secondary' : 'ghost'"
          size="icon-sm"
          :icon="tool.icon"
          :disabled="tool.disabled"
          :aria-label="t(tool.key)"
          :aria-pressed="tool.on"
          :title="t(tool.key)"
          @mousedown.prevent
          @click="tool.run"
        />
      </div>
    </div>

    <form
      v-if="linkOpen"
      class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border"
      @submit.prevent="applyLink"
      @keydown.esc.stop="closeLink"
    >
      <UiInput
        ref="linkInput"
        v-model="linkUrl"
        class="flex-1"
        inputmode="url"
        :placeholder="t('linkPlaceholder')"
        :aria-label="t('linkPlaceholder')"
      />
      <UiButton type="submit" size="sm">{{ t("linkApply") }}</UiButton>
      <UiButton
        v-if="active('link')"
        type="button"
        variant="ghost"
        size="sm"
        @click="removeLink"
      >
        {{ t("linkRemove") }}
      </UiButton>
    </form>

    <div
      class="relative flex-1 min-h-0 overflow-y-auto cursor-text"
      @click.self="editor?.commands.focus('end')"
    >
      <span
        v-if="isEmpty"
        class="absolute left-4 top-4 text-sm text-muted-foreground pointer-events-none"
      >
        {{ placeholder }}
      </span>
      <EditorContent :editor="editor" />
    </div>
  </div>
</template>

<style scoped>
:deep(.compose-editor a) {
  color: var(--color-primary, #2563eb);
  text-decoration: underline;
}
:deep(.compose-editor ul) {
  list-style: disc;
  padding-left: 1.5rem;
}
:deep(.compose-editor ol) {
  list-style: decimal;
  padding-left: 1.5rem;
}
:deep(.compose-editor blockquote) {
  border-left: 3px solid var(--color-border, #d4d4d8);
  padding-left: 0.75rem;
  margin: 0.25rem 0;
  color: var(--color-muted-foreground, inherit);
}
:deep(.compose-editor p) {
  min-height: 1.25em;
  word-break: break-word;
}
</style>

<i18n lang="yaml">
de:
  undo: Rückgängig (Strg+Z)
  redo: Wiederholen (Strg+Umschalt+Z)
  bold: Fett (Strg+B)
  italic: Kursiv (Strg+I)
  underline: Unterstrichen (Strg+U)
  strike: Durchgestrichen
  bulletList: Aufzählung
  orderedList: Nummerierte Liste
  blockquote: Zitat
  link: Link (Strg+K)
  linkPlaceholder: Adresse des Links
  linkApply: Übernehmen
  linkRemove: Link entfernen
en:
  undo: Undo (Ctrl+Z)
  redo: Redo (Ctrl+Shift+Z)
  bold: Bold (Ctrl+B)
  italic: Italic (Ctrl+I)
  underline: Underline (Ctrl+U)
  strike: Strikethrough
  bulletList: Bulleted list
  orderedList: Numbered list
  blockquote: Quote
  link: Link (Ctrl+K)
  linkPlaceholder: Link address
  linkApply: Apply
  linkRemove: Remove link
</i18n>
