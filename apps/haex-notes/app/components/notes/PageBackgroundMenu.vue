<script setup lang="ts">
import { Check, Grid3x3 } from "@lucide/vue";
import {
  changedBackground, changedMargin, MARGIN_EDGES, MARGIN_MAX, marginsOf, mmToPx, PAPER_COLORS, pxToMm, resetMargins,
  type BackgroundChange, type MarginEdge,
} from "~/lib/pageBackground";
import { setPageBackground } from "~/lib/commands";
import { alignAllText } from "~/lib/elementEdits";
import { rowsOf } from "~/lib/paperRows";
import { textHeightOf } from "~/lib/render/measureText";
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

const rows = computed(() => (background.value ? rowsOf(background.value) : null));

function alignText() {
  const target = rows.value;
  if (target) notebook.applyEdit((doc) => alignAllText(doc, target, textHeightOf));
}

const margins = computed(() => (background.value ? marginsOf(background.value) : null));
const maxMm = pxToMm(MARGIN_MAX);

function chooseMargin(edge: MarginEdge, event: Event) {
  const input = event.target as HTMLInputElement;
  notebook.applyEdit((doc) => {
    const next = changedMargin(doc.background, edge, mmToPx(input.valueAsNumber));
    return next ? setPageBackground(doc, next, t("undoMargins")) : null;
  });
  // Eine ungültige oder begrenzte Eingabe zeigt wieder den Rand der Seite.
  if (margins.value) input.value = String(pxToMm(margins.value[edge]));
}

function resetPageMargins() {
  notebook.applyEdit((doc) => {
    const next = resetMargins(doc.background);
    return next ? setPageBackground(doc, next, t("undoMargins")) : null;
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
    <ShadcnPopoverContent v-if="background" align="end" class="w-64 p-2">
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
      <button
        v-if="rows"
        class="mt-1 w-full rounded border border-border px-2 py-1 text-left text-sm hover:bg-accent"
        @click="alignText"
      >
        {{ t('alignText') }}
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
      <div class="mb-1 mt-2 flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
        {{ t('margins') }}
        <button
          class="font-normal underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40"
          :disabled="!background.margins"
          @click="resetPageMargins"
        >
          {{ t('resetMargins') }}
        </button>
      </div>
      <div v-if="margins" class="grid grid-cols-2 gap-2 px-1 pb-1">
        <label v-for="edge in MARGIN_EDGES" :key="edge" class="grid gap-0.5 text-xs text-muted-foreground">
          {{ t(`edges.${edge}`) }}
          <input
            type="number" min="0" :max="maxMm" step="1"
            :value="pxToMm(margins[edge])"
            class="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            @change="chooseMargin(edge, $event)"
          >
        </label>
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
  alignText: Schrift an Papier anpassen
  margins: Seitenrand (mm)
  resetMargins: Zurücksetzen
  undoMargins: Seitenrand ändern
  edges:
    top: Oben
    bottom: Unten
    left: Links
    right: Rechts
en:
  title: Page background
  template: Template
  paper: Paper colour
  undoLabel: Change background
  alignText: Fit text to the paper
  margins: Page margin (mm)
  resetMargins: Reset
  undoMargins: Change page margin
  edges:
    top: Top
    bottom: Bottom
    left: Left
    right: Right
</i18n>
