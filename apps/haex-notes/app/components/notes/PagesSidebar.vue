<script setup lang="ts">
import { X, Trash2, RotateCcw, ChevronDown } from "lucide-vue-next";
import { DnDProvider } from "@vue-dnd-kit/core";
import { PAGE_TEMPLATES } from "~/utils/pageTemplates";
import type { SelectPage } from "~/database/schemas";

const emit = defineEmits<{
  close: [];
  previewTrashPage: [page: SelectPage];
  trashRestored: [pageId: string];
}>();

const { t, locale } = useI18n();
const notebook = useNotebookStore();

const showTrash = ref(false);
const trashedPages = ref<SelectPage[]>([]);

const loadTrash = async () => {
  if (!notebook.currentNotebook) return;
  trashedPages.value = await notebook.listTrashAsync(notebook.currentNotebook.id);
};

watch(showTrash, async (v) => {
  if (v) await loadTrash();
});

// Reload trash when pages change (e.g. a page was deleted)
watch(() => notebook.currentPages.length, async () => {
  if (showTrash.value) await loadTrash();
});

const restorePage = async (pageId: string) => {
  await notebook.restorePageAsync(pageId);
  await loadTrash();
  emit("trashRestored", pageId);
};

const emptyTrash = async () => {
  if (!notebook.currentNotebook) return;
  await notebook.emptyTrashAsync(notebook.currentNotebook.id);
  trashedPages.value = [];
};

const getTemplateLabel = (template: string) => {
  const tmpl = PAGE_TEMPLATES.find(t => t.id === template);
  if (!tmpl) return template;
  return locale.value === "de" ? tmpl.i18n.de : tmpl.i18n.en;
};
</script>

<template>
  <div class="flex h-full w-52 flex-col border-l border-border bg-background">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border px-3 py-2">
      <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {{ t("pages") }}
      </span>
      <button
        class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>
    </div>

    <!-- Page List with DnD -->
    <DnDProvider>
      <NotesPagesSidebarList />
    </DnDProvider>

    <!-- Trash section -->
    <div class="border-t border-border">
      <button
        class="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        @click="showTrash = !showTrash"
      >
        <div class="flex items-center gap-1.5">
          <Trash2 class="size-3.5" />
          <span>{{ t("trash") }}</span>
        </div>
        <ChevronDown
          class="size-3.5 transition-transform"
          :class="showTrash ? 'rotate-180' : ''"
        />
      </button>

      <div v-if="showTrash" class="max-h-40 overflow-y-auto px-1.5 pb-1.5">
        <div v-if="trashedPages.length === 0" class="px-2 py-2 text-center text-[10px] italic text-muted-foreground">
          {{ t("trashEmpty") }}
        </div>
        <template v-else>
          <div
            v-for="page in trashedPages"
            :key="page.id"
            class="mb-1 flex cursor-pointer items-center gap-1 rounded-lg border border-border p-1.5 hover:border-primary/30"
            @click="emit('previewTrashPage', page)"
          >
            <div class="min-w-0 flex-1">
              <div class="text-xs text-muted-foreground">{{ getTemplateLabel(page.template) }}</div>
            </div>
            <button
              class="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              :title="t('restore')"
              @click.stop="restorePage(page.id)"
            >
              <RotateCcw class="size-3.5" />
            </button>
          </div>
          <button
            class="mt-1.5 w-full rounded-md px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
            @click="emptyTrash"
          >
            {{ t("emptyTrash") }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  pages: Seiten
  trash: Papierkorb
  trashEmpty: Papierkorb ist leer
  restore: Wiederherstellen
  emptyTrash: Papierkorb leeren
en:
  pages: Pages
  trash: Trash
  trashEmpty: Trash is empty
  restore: Restore
  emptyTrash: Empty Trash
</i18n>
