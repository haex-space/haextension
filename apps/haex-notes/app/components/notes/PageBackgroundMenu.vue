<script setup lang="ts">
import { Check, Grid3x3 } from "@lucide/vue";
import { changedBackground, PAPER_COLORS, type BackgroundChange } from "~/lib/pageBackground";
import { setPageBackground } from "~/lib/commands";
import { PAGE_TEMPLATES, templateLabel } from "~/utils/pageTemplates";

/** Vorlage (kariert, liniert, ...) und Papierfarbe der offenen Seite; die Wahl lässt sich rückgängig machen. */
const { t, locale } = useI18n();
const notebook = useNotebookStore();

const background = computed(() => notebook.currentDoc?.background ?? null);

function choose(change: BackgroundChange) {
  notebook.applyEdit((doc) => {
    const next = changedBackground(doc.background, change);
    return next ? setPageBackground(doc, next, t("undoLabel")) : null;
  });
}
</script>

<template>
  <ShadcnPopover>
    <ShadcnPopoverTrigger as-child>
      <button
        class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        :title="t('title')"
        :disabled="!background"
      >
        <Grid3x3 class="size-4" />
      </button>
    </ShadcnPopoverTrigger>
    <ShadcnPopoverContent v-if="background" align="end" class="w-60 p-2">
      <div class="mb-1 px-1 text-xs font-medium text-muted-foreground">{{ t('template') }}</div>
      <button
        v-for="tmpl in PAGE_TEMPLATES"
        :key="tmpl.id"
        class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent"
        :aria-pressed="background.template === tmpl.id"
        @click="choose({ template: tmpl.id })"
      >
        {{ templateLabel(tmpl.id, locale) }}
        <Check v-if="background.template === tmpl.id" class="size-4" />
      </button>
      <div class="mb-1 mt-2 px-1 text-xs font-medium text-muted-foreground">{{ t('paper') }}</div>
      <div class="flex gap-2 px-1 pb-1">
        <button
          v-for="paper in PAPER_COLORS"
          :key="paper.id"
          class="size-7 rounded-full border border-border"
          :class="background.paperColor === paper.color ? 'ring-2 ring-ring' : ''"
          :style="{ backgroundColor: paper.color }"
          :title="locale === 'de' ? paper.i18n.de : paper.i18n.en"
          :aria-label="locale === 'de' ? paper.i18n.de : paper.i18n.en"
          :aria-pressed="background.paperColor === paper.color"
          @click="choose({ paperColor: paper.color })"
        />
      </div>
    </ShadcnPopoverContent>
  </ShadcnPopover>
</template>

<i18n lang="yaml">
de:
  title: Hintergrund der Seite
  template: Vorlage
  paper: Papierfarbe
  undoLabel: Hintergrund ändern
en:
  title: Page background
  template: Template
  paper: Paper colour
  undoLabel: Change background
</i18n>
