<script setup lang="ts">
import { makeDroppable } from "@vue-dnd-kit/core";
import type { IDragEvent } from "@vue-dnd-kit/core";
import { PAGE_TEMPLATES } from "~/utils/pageTemplates";
import type { SelectPage } from "~/database/schemas";

const { locale } = useI18n();
const notebook = useNotebookStore();

const listRef = useTemplateRef<HTMLElement>("listRef");

const getTemplateLabel = (template: string) => {
  const tmpl = PAGE_TEMPLATES.find(t => t.id === template);
  if (!tmpl) return template;
  return locale.value === "de" ? tmpl.i18n.de : tmpl.i18n.en;
};

function applySort(e: IDragEvent) {
  const result = e.helpers.suggestSort("vertical");
  if (!result) return;

  // Apply reorder in-memory
  notebook.currentPages = result.sourceItems as SelectPage[];

  // Persist new page numbers
  const haexVault = useHaexVaultStore();
  const db = haexVault.orm;
  if (db) {
    import("~/database/schemas").then(({ pages }) => {
      import("drizzle-orm").then(({ eq }) => {
        notebook.currentPages.forEach(async (p, i) => {
          if (p.pageNumber !== i) {
            await db.update(pages).set({ pageNumber: i }).where(eq(pages.id, p.id));
            p.pageNumber = i;
          }
        });
      });
    });
  }
}

makeDroppable(listRef, {
  events: {
    onDrop(e: IDragEvent) {
      applySort(e);
    },
  },
}, () => notebook.currentPages);
</script>

<template>
  <div ref="listRef" class="flex-1 overflow-y-auto p-1.5">
    <TransitionGroup name="list">
      <NotesPagesSidebarItem
        v-for="(page, idx) in notebook.currentPages"
        :key="page.id"
        :page="page"
        :index="idx"
        :items="notebook.currentPages"
        :is-active="idx === notebook.currentPageIndex"
        :can-delete="notebook.currentPages.length > 1"
        :template-label="getTemplateLabel(page.template)"
        @select="notebook.goToPage(idx)"
        @delete="notebook.deletePageAsync(idx)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.list-move {
  transition: 0.2s cubic-bezier(0.165, 0.84, 0.44, 1);
}
.list-leave-active {
  position: absolute;
  pointer-events: none;
}
</style>
