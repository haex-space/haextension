<script setup lang="ts">
import { Check } from "@lucide/vue";
import type { FilterType } from "~/types";

const { t } = useI18n();
const editor = useEditorStore();
const processor = useImageProcessor();

const filterPresets: { id: FilterType; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Graustufen" },
  { id: "sepia", label: "Sepia" },
  { id: "invert", label: "Invertieren" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Kühl" },
  { id: "vintage", label: "Vintage" },
];

async function confirmFilter() {
  await processor.applyFilter(editor.activeFilter);
}
</script>

<template>
  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t("filter") }}</p>
  <div class="flex flex-col gap-1">
    <button
      v-for="f in filterPresets"
      :key="f.id"
      class="rounded-md px-3 py-2 text-left text-sm transition-colors"
      :class="editor.activeFilter === f.id
        ? 'bg-primary text-primary-foreground'
        : 'hover:bg-accent/50'"
      @click="editor.activeFilter = f.id"
    >
      {{ f.label }}
    </button>
  </div>
  <button
    v-if="editor.activeFilter !== 'none'"
    class="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
    @click="confirmFilter"
  >
    <Check class="size-4" />
    {{ t("applyFilter") }}
  </button>
</template>

<i18n lang="yaml">
de:
  filter: Filter
  applyFilter: Filter anwenden
en:
  filter: Filter
  applyFilter: Apply Filter
</i18n>
