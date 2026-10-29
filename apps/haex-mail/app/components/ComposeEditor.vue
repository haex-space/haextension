<script setup lang="ts">
import {
  Bold,
  ExternalLink,
  FileCode,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  Pencil,
  Quote,
  Redo2,
  Smile,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
  Unlink,
} from "@lucide/vue";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import type { Component } from "vue";
import { toast } from "vue-sonner";
import { markdownForEditor, safeHref, textToBody } from "~/lib/composeBody";
import { EMOJI_GROUPS } from "~/lib/emojis";
import { isWebUrl } from "~/lib/mailHtml";
import { getErrorMessage } from "~/lib/utils";

/**
 * Rich-text editor for the message body, with a Markdown mode that edits the
 * same content as Markdown source. The model is the editor's HTML;
 * `~/lib/composeBody` turns it into the text and HTML that get sent.
 * Undo/redo and the usual shortcuts (Ctrl+B/I/U, Ctrl+Z, Ctrl+Shift+Z or
 * Ctrl+Y) come from TipTap; a link pasted over selected text links it.
 */
const model = defineModel<string>({ default: "" });

const props = defineProps<{ placeholder?: string }>();

const emit = defineEmits<{
  /** The attach button was pressed; the parent opens its file picker. */
  attach: [];
  /** Files were dropped or pasted into the editor. */
  files: [files: File[]];
}>();

const { t } = useI18n();

/** Opens a web link in the system browser (Ctrl/Cmd+click and the link bar). */
const openHrefAsync = async (href: string | null | undefined) => {
  if (!href || !isWebUrl(href)) return;
  try {
    await useHaexVaultStore().client.web.openAsync(href);
  } catch (err) {
    toast.error(getErrorMessage(err));
  }
};

const editor = useEditor({
  content: model.value,
  extensions: [
    // Markdown can produce headings, code and rules, so the schema keeps them.
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, defaultProtocol: "https" },
    }),
    TableKit.configure({ table: { resizable: false } }),
    Markdown,
  ],
  editorProps: {
    attributes: {
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": props.placeholder ?? "",
      class: "compose-editor px-4 py-4 text-sm focus:outline-none",
    },
    handleClick: (_view, _pos, event) => {
      if (!(event.ctrlKey || event.metaKey)) return false;
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return false;
      void openHrefAsync(anchor.getAttribute("href"));
      return true;
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
    if (markdownMode.value) markdown.value = editor.value.getMarkdown();
  }
});

const active = (name: string) => !!editor.value?.isActive(name);

// --- Markdown mode ---------------------------------------------------------

const markdownMode = ref(false);
const markdown = ref("");
const markdownArea = ref<HTMLTextAreaElement>();

/** The editor stays the single source of the model: Markdown is parsed into it on every edit. */
const setMarkdown = (source: string) => {
  markdown.value = source;
  const ed = editor.value;
  if (!ed) return;
  ed.commands.setContent(markdownForEditor(source), {
    contentType: "markdown",
    emitUpdate: true,
  });
  // Parsing that yields nothing from non-empty text must not drop what was typed.
  if (ed.isEmpty && source.trim()) {
    ed.commands.setContent(textToBody(source), { emitUpdate: true });
  }
};

const onMarkdownInput = (e: Event) => setMarkdown((e.target as HTMLTextAreaElement).value);

// --- Emojis ------------------------------------------------------------------

const emojiOpen = ref(false);
const emojiGroup = ref(EMOJI_GROUPS[0]!.key);
const emojiGroupEmojis = computed(
  () => EMOJI_GROUPS.find((g) => g.key === emojiGroup.value)?.emojis ?? [],
);

const insertEmoji = (emoji: string) => {
  emojiOpen.value = false;
  const area = markdownArea.value;
  if (markdownMode.value && area) {
    area.focus();
    area.setRangeText(emoji, area.selectionStart, area.selectionEnd, "end");
    setMarkdown(area.value);
  } else {
    editor.value?.chain().focus().insertContent(emoji).run();
  }
};

// --- Files -------------------------------------------------------------------

const hasFiles = (e: DragEvent | ClipboardEvent) => {
  const data = e instanceof DragEvent ? e.dataTransfer : e.clipboardData;
  return !!data && data.files.length > 0;
};

/** Dropped files become attachments instead of being opened by the webview. */
const onDragover = (e: DragEvent) => {
  if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
};

const onDrop = (e: DragEvent) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  emit("files", Array.from(e.dataTransfer!.files));
};

/** Only files without text: copying from a document also puts a picture on the clipboard. */
const onPasteCapture = (e: ClipboardEvent) => {
  if (!hasFiles(e) || e.clipboardData!.getData("text/plain")) return;
  e.preventDefault();
  e.stopPropagation();
  emit("files", Array.from(e.clipboardData!.files));
};

// --- Tables ------------------------------------------------------------------

const insertTable = () => {
  if (active("table")) return;
  editor.value
    ?.chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run();
};

const tableActions = computed(() => {
  const e = editor.value;
  return [
    { key: "rowAdd", run: () => e?.chain().focus().addRowAfter().run() },
    { key: "columnAdd", run: () => e?.chain().focus().addColumnAfter().run() },
    { key: "rowDelete", run: () => e?.chain().focus().deleteRow().run() },
    { key: "columnDelete", run: () => e?.chain().focus().deleteColumn().run() },
    { key: "tableDelete", run: () => e?.chain().focus().deleteTable().run() },
  ];
});

const toggleMarkdown = () => {
  const ed = editor.value;
  if (!ed) return;
  linkEditing.value = false;
  if (markdownMode.value) {
    markdownMode.value = false;
    nextTick(() => ed.commands.focus("end"));
  } else {
    markdown.value = ed.getMarkdown();
    markdownMode.value = true;
    nextTick(() => markdownArea.value?.focus());
  }
};

// --- Links -----------------------------------------------------------------

const linkEditing = ref(false);
const linkUrl = ref("");
const linkInput = ref<{ $el?: HTMLElement } | null>(null);

/** The link under the cursor or selection, if any. */
const currentHref = computed<string | undefined>(() =>
  active("link") ? editor.value?.getAttributes("link").href : undefined,
);

const openLinkEditor = () => {
  if (!editor.value) return;
  linkUrl.value = editor.value.getAttributes("link").href ?? "";
  linkEditing.value = true;
  nextTick(() =>
    (linkInput.value?.$el?.querySelector("input") ?? linkInput.value?.$el)?.focus?.(),
  );
};

const closeLinkEditor = () => {
  linkEditing.value = false;
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
  linkEditing.value = false;
};

const removeLink = () => {
  editor.value?.chain().focus().extendMarkRange("link").unsetLink().run();
  linkEditing.value = false;
};

const onKeydown = (e: KeyboardEvent) => {
  if (
    (e.ctrlKey || e.metaKey) &&
    !e.altKey &&
    e.key.toLowerCase() === "k" &&
    !markdownMode.value
  ) {
    e.preventDefault();
    openLinkEditor();
  }
};

// --- Toolbar ---------------------------------------------------------------

const isEmpty = computed(() => !editor.value || editor.value.isEmpty);

/** The Markdown textarea keeps its own history, separate from the editor's. */
const textareaHistory = (command: "undo" | "redo") => {
  markdownArea.value?.focus();
  document.execCommand(command);
};

interface Tool {
  key: string;
  icon: Component;
  on: boolean;
  disabled?: boolean;
  run: () => void;
}

const tools = computed<Tool[][]>(() => {
  const e = editor.value;
  const md = markdownMode.value;
  return [
    [
      {
        key: "undo",
        icon: Undo2,
        on: false,
        disabled: md ? false : !e?.can().undo(),
        run: () => (md ? textareaHistory("undo") : void e?.chain().focus().undo().run()),
      },
      {
        key: "redo",
        icon: Redo2,
        on: false,
        disabled: md ? false : !e?.can().redo(),
        run: () => (md ? textareaHistory("redo") : void e?.chain().focus().redo().run()),
      },
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
    [
      { key: "link", icon: Link2, on: active("link"), run: openLinkEditor },
      { key: "table", icon: TableIcon, on: active("table"), run: insertTable },
    ],
  ];
});
</script>

<template>
  <div
    class="flex-1 flex flex-col min-h-0"
    @keydown="onKeydown"
    @dragover.capture="onDragover"
    @drop.capture="onDrop"
    @paste.capture="onPasteCapture"
  >
    <div class="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 border-b border-border">
      <!-- In Markdown mode only undo/redo apply; the rest is written as Markdown. -->
      <template v-for="(group, i) in tools" :key="i">
        <div v-if="!markdownMode || i === 0" class="flex items-center gap-1">
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
      </template>
      <div class="flex items-center gap-1">
        <ShadcnPopover v-model:open="emojiOpen">
          <ShadcnPopoverTrigger as-child>
            <UiButton
              type="button"
              variant="ghost"
              size="icon-sm"
              :icon="Smile"
              :aria-label="t('emoji')"
              :title="t('emoji')"
              @mousedown.prevent
            />
          </ShadcnPopoverTrigger>
          <ShadcnPopoverContent class="w-72 p-2" align="start" data-testid="emoji-picker">
            <div class="flex gap-1 pb-2 mb-2 border-b border-border" role="tablist">
              <button
                v-for="group in EMOJI_GROUPS"
                :key="group.key"
                type="button"
                role="tab"
                class="rounded px-2 py-1 text-base hover:bg-accent"
                :class="{ 'bg-accent': emojiGroup === group.key }"
                :aria-selected="emojiGroup === group.key"
                :aria-label="t(`emojiGroup.${group.key}`)"
                :title="t(`emojiGroup.${group.key}`)"
                @click="emojiGroup = group.key"
              >
                {{ group.icon }}
              </button>
            </div>
            <div class="grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
              <button
                v-for="emoji in emojiGroupEmojis"
                :key="emoji"
                type="button"
                class="rounded p-1 text-lg leading-none hover:bg-accent"
                data-emoji
                @click="insertEmoji(emoji)"
              >
                {{ emoji }}
              </button>
            </div>
          </ShadcnPopoverContent>
        </ShadcnPopover>
        <UiButton
          type="button"
          variant="ghost"
          size="icon-sm"
          :icon="Paperclip"
          :aria-label="t('attach')"
          :title="t('attach')"
          @mousedown.prevent
          @click="emit('attach')"
        />
      </div>
      <UiButton
        type="button"
        :variant="markdownMode ? 'secondary' : 'ghost'"
        size="sm"
        class="ml-auto"
        :aria-pressed="markdownMode"
        :title="t('markdownHint')"
        @mousedown.prevent
        @click="toggleMarkdown"
      >
        <FileCode class="size-4" />
        {{ t("markdown") }}
      </UiButton>
    </div>

    <form
      v-if="linkEditing && !markdownMode"
      class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border"
      @submit.prevent="applyLink"
      @keydown.esc.stop="closeLinkEditor"
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
        v-if="currentHref"
        type="button"
        variant="ghost"
        size="sm"
        @click="removeLink"
      >
        {{ t("linkRemove") }}
      </UiButton>
    </form>

    <!-- Where the link under the cursor goes, with the ways to use or change it -->
    <div
      v-else-if="currentHref && !markdownMode"
      class="shrink-0 flex items-center gap-1 px-3 py-1 border-b border-border text-sm"
      data-testid="link-bar"
    >
      <Link2 class="size-4 shrink-0 text-muted-foreground" />
      <span class="flex-1 min-w-0 truncate" :title="currentHref">{{ currentHref }}</span>
      <UiButton
        v-if="isWebUrl(currentHref)"
        type="button"
        variant="ghost"
        size="icon-sm"
        :icon="ExternalLink"
        :aria-label="t('linkOpen')"
        :title="t('linkOpen')"
        @mousedown.prevent
        @click="openHrefAsync(currentHref)"
      />
      <UiButton
        type="button"
        variant="ghost"
        size="icon-sm"
        :icon="Pencil"
        :aria-label="t('linkEdit')"
        :title="t('linkEdit')"
        @mousedown.prevent
        @click="openLinkEditor"
      />
      <UiButton
        type="button"
        variant="ghost"
        size="icon-sm"
        :icon="Unlink"
        :aria-label="t('linkRemove')"
        :title="t('linkRemove')"
        @mousedown.prevent
        @click="removeLink"
      />
    </div>

    <!-- Rows and columns of the table under the cursor -->
    <div
      v-if="active('table') && !markdownMode"
      class="shrink-0 flex flex-wrap items-center gap-1 px-3 py-1 border-b border-border"
      data-testid="table-bar"
    >
      <UiButton
        v-for="action in tableActions"
        :key="action.key"
        type="button"
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="action.run"
      >
        {{ t(action.key) }}
      </UiButton>
    </div>

    <div
      v-show="!markdownMode"
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

    <textarea
      v-show="markdownMode"
      ref="markdownArea"
      :value="markdown"
      class="flex-1 w-full min-h-0 px-4 py-4 text-sm font-mono bg-transparent resize-none focus:outline-none"
      :placeholder="placeholder"
      :aria-label="t('markdownSource')"
      spellcheck="false"
      @input="onMarkdownInput"
    />
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
:deep(.compose-editor h1),
:deep(.compose-editor h2),
:deep(.compose-editor h3) {
  font-weight: 600;
  margin: 0.5rem 0 0.25rem;
}
:deep(.compose-editor h1) {
  font-size: 1.5em;
}
:deep(.compose-editor h2) {
  font-size: 1.25em;
}
:deep(.compose-editor h3) {
  font-size: 1.1em;
}
:deep(.compose-editor code) {
  font-family: ui-monospace, monospace;
  background: color-mix(in srgb, currentColor 10%, transparent);
  border-radius: 0.25rem;
  padding: 0 0.25rem;
}
:deep(.compose-editor pre) {
  font-family: ui-monospace, monospace;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  margin: 0.25rem 0;
  overflow-x: auto;
}
:deep(.compose-editor pre code) {
  background: none;
  padding: 0;
}
:deep(.compose-editor table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
  table-layout: fixed;
  width: 100%;
}
:deep(.compose-editor th),
:deep(.compose-editor td) {
  border: 1px solid var(--color-border, #d4d4d8);
  padding: 0.25rem 0.5rem;
  vertical-align: top;
  text-align: left;
  position: relative;
  min-width: 3rem;
}
:deep(.compose-editor th) {
  background: color-mix(in srgb, currentColor 8%, transparent);
  font-weight: 600;
}
:deep(.compose-editor td > p),
:deep(.compose-editor th > p) {
  margin: 0;
}
:deep(.compose-editor .selectedCell) {
  background: color-mix(in srgb, var(--color-primary, #2563eb) 15%, transparent);
}
:deep(.compose-editor hr) {
  border: 0;
  border-top: 1px solid var(--color-border, #d4d4d8);
  margin: 0.75rem 0;
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
  linkOpen: Link öffnen (Strg+Klick)
  linkEdit: Link ändern
  markdown: Markdown
  markdownHint: Zwischen Editor und Markdown-Quelltext wechseln
  markdownSource: Nachricht als Markdown
  table: Tabelle einfügen
  rowAdd: "+ Zeile"
  columnAdd: "+ Spalte"
  rowDelete: "− Zeile"
  columnDelete: "− Spalte"
  tableDelete: Tabelle entfernen
  emoji: Emoji einfügen
  attach: Datei anhängen
  emojiGroup:
    smileys: Smileys
    gestures: Gesten
    symbols: Symbole
    objects: Dinge
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
  linkOpen: Open link (Ctrl+click)
  linkEdit: Edit link
  markdown: Markdown
  markdownHint: Switch between the editor and Markdown source
  markdownSource: Message as Markdown
  table: Insert table
  rowAdd: "+ Row"
  columnAdd: "+ Column"
  rowDelete: "− Row"
  columnDelete: "− Column"
  tableDelete: Remove table
  emoji: Insert emoji
  attach: Attach file
  emojiGroup:
    smileys: Smileys
    gestures: Gestures
    symbols: Symbols
    objects: Objects
</i18n>
