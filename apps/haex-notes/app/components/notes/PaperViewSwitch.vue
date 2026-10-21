<script setup lang="ts">
import { originalLayerId, setPaperView, viewOf, type PaperView } from "~/lib/paperNotes/views";

/** Original, Entwurf oder Vergleich einer Fotoseite; erscheint nur auf Seiten aus einem Foto. */
const notebook = useNotebookStore();
const { t } = useI18n();

const VIEWS: PaperView[] = ["original", "draft", "compare"];

const current = computed<PaperView | null>(() => {
  const doc = notebook.currentDoc;
  if (!doc?.paperImport) return null;
  const originalId = originalLayerId(doc.layers, doc.paperImport);
  return originalId ? viewOf(doc.layers, originalId) : null;
});

const show = (view: PaperView) => notebook.applyEdit((doc) => setPaperView(doc, view));
</script>

<template>
  <div v-if="current" class="flex overflow-hidden rounded-lg border border-border text-xs" role="group" :aria-label="t('label')">
    <button
      v-for="view in VIEWS"
      :key="view"
      class="px-2 py-1"
      :class="current === view ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'"
      :aria-pressed="current === view"
      @click="show(view)"
    >
      {{ t(view) }}
    </button>
  </div>
</template>

<i18n lang="yaml">
de:
  label: Ansicht der Fotoseite
  original: Original
  draft: Entwurf
  compare: Vergleich
en:
  label: View of the photo page
  original: Original
  draft: Draft
  compare: Compare
</i18n>
