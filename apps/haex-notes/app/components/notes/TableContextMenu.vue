<script setup lang="ts">
import type { TableElement } from "~/types/document";

/** Kontextmenü einer Tabelle an der Stelle des Rechtsklicks. */
const props = defineProps<{ table: TableElement; pageX: number; pageY: number }>();
const emit = defineEmits<{ close: [] }>();
const notebook = useNotebookStore();
const { t } = useI18n();

const run = (action: (id: string) => void) => {
  action(props.table.id);
  emit("close");
};
</script>

<template>
  <div
    class="fixed z-50 min-w-40 rounded-lg border border-border bg-popover p-1 shadow-xl"
    :style="{ left: `${pageX}px`, top: `${pageY}px` }"
  >
    <button
      class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
      @click="run(notebook.addTableRow)"
    >
      {{ t("addRow") }}
    </button>
    <button
      class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
      @click="run(notebook.addTableColumn)"
    >
      {{ t("addColumn") }}
    </button>
    <div class="my-1 h-px bg-border" />
    <button
      class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
      :class="table.rows <= 1 ? 'opacity-30 pointer-events-none' : ''"
      @click="run(notebook.removeTableRow)"
    >
      {{ t("removeRow") }}
    </button>
    <button
      class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
      :class="table.columns <= 1 ? 'opacity-30 pointer-events-none' : ''"
      @click="run(notebook.removeTableColumn)"
    >
      {{ t("removeColumn") }}
    </button>
    <div class="my-1 h-px bg-border" />
    <button
      class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
      @click="run(notebook.removeTable)"
    >
      {{ t("deleteTable") }}
    </button>
  </div>
</template>

<i18n lang="yaml">
de:
  addRow: Zeile hinzufügen
  addColumn: Spalte hinzufügen
  removeRow: Zeile entfernen
  removeColumn: Spalte entfernen
  deleteTable: Tabelle löschen
en:
  addRow: Add row
  addColumn: Add column
  removeRow: Remove row
  removeColumn: Remove column
  deleteTable: Delete table
</i18n>
