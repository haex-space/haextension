<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')" :description="t('description')">
    <template #content>
      <div class="grid gap-3 p-4 text-sm">
        <label class="grid gap-1">
          <span class="text-muted-foreground">{{ t('paper') }}</span>
          <select v-model="settings.paper" class="h-9 rounded-md border border-input bg-background px-2">
            <option v-for="value in PAPERS" :key="value" :value="value">{{ t(`papers.${value}`) }}</option>
          </select>
        </label>
        <label class="grid gap-1">
          <span class="text-muted-foreground">{{ t('orientation') }}</span>
          <select v-model="settings.orientation" class="h-9 rounded-md border border-input bg-background px-2">
            <option v-for="value in ORIENTATIONS" :key="value" :value="value">{{ t(`orientations.${value}`) }}</option>
          </select>
        </label>
        <label class="grid gap-1">
          <span class="text-muted-foreground">{{ t('margin') }}</span>
          <input
            v-model.number="settings.marginMm" type="number" min="0" :max="MAX_MARGIN_MM" step="1"
            class="h-9 rounded-md border border-input bg-background px-2"
            @change="settings.marginMm = clampMarginMm(settings.marginMm)"
          >
        </label>
        <label class="grid gap-1">
          <span class="text-muted-foreground">{{ t('quality') }}</span>
          <select v-model="settings.quality" class="h-9 rounded-md border border-input bg-background px-2">
            <option v-for="value in QUALITIES" :key="value" :value="value">{{ t(`qualities.${value}`) }}</option>
          </select>
        </label>
        <label v-if="hasOriginal" class="flex items-center gap-2">
          <input v-model="settings.showOriginal" type="checkbox">
          {{ t('showOriginal') }}
        </label>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button class="px-3 py-2 text-sm text-muted-foreground" :disabled="exporting" @click="isOpen = false">
          {{ t('cancel') }}
        </button>
        <button
          class="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          :disabled="exporting" @click="exportAsync"
        >
          <Loader2 v-if="exporting" class="size-4 animate-spin" />{{ t('export') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { Loader2 } from "@lucide/vue";
import { toast } from "vue-sonner";
import { reportError } from "~/lib/errors";
import { clampMarginMm, defaultPdfSettings, MAX_MARGIN_MM, type Orientation, type PaperSize, type PdfSettings, type Quality } from "~/lib/paperNotes/exportPdf";
import { originalLayerId } from "~/lib/paperNotes/views";

/** Exportiert die geöffnete Seite als PDF; die Voreinstellungen zeigen die Seite, wie sie gerade zu sehen ist. */
const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();
const notebook = useNotebookStore();
const pdfExport = usePdfExport();

const PAPERS: PaperSize[] = ["auto", "a4", "letter"];
const ORIENTATIONS: Orientation[] = ["auto", "portrait", "landscape"];
const QUALITIES: Quality[] = ["high", "medium", "low"];

const originalLayer = computed(() => {
  const doc = notebook.currentDoc;
  const id = doc?.paperImport ? originalLayerId(doc.layers, doc.paperImport) : null;
  return doc?.layers.find((layer) => layer.id === id) ?? null;
});
const hasOriginal = computed(() => originalLayer.value !== null);

const settings = ref<PdfSettings>(defaultPdfSettings(false));
const exporting = ref(false);
/** Zählt jedes Öffnen; ein Export schließt nur den Dialog, aus dem er gestartet wurde. */
let opened = 0;

watch(isOpen, (open) => {
  if (!open) return;
  opened++;
  settings.value = defaultPdfSettings(originalLayer.value?.visible ?? false);
});

/** Ein Dateiname ohne Zeichen, die ein Dateisystem ablehnt. */
const fileName = () => {
  const name = `${notebook.currentNotebook?.name ?? t('notebook')} ${t('page')} ${notebook.currentPageIndex + 1}`;
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim();
};

async function exportAsync() {
  const doc = notebook.currentDoc;
  if (!doc) return;
  exporting.value = true;
  const started = opened;
  try {
    const saved = await pdfExport.exportPageAsync(doc, { ...settings.value }, fileName(), t('title'));
    if (saved) toast.success(t('saved'));
    if (saved && started === opened) isOpen.value = false;
  } catch (error) {
    reportError(error);
  } finally {
    exporting.value = false;
  }
}
</script>

<i18n lang="yaml">
de:
  title: Als PDF exportieren
  description: Die Seite wird so exportiert, wie sie gerade zu sehen ist.
  paper: Papierformat
  papers:
    auto: Wie die Seite
    a4: A4
    letter: Letter
  orientation: Ausrichtung
  orientations:
    auto: Wie die Seite
    portrait: Hochformat
    landscape: Querformat
  margin: Rand (mm)
  quality: Qualität
  qualities:
    high: Hoch
    medium: Mittel
    low: Niedrig (kleine Datei)
  showOriginal: Originalfoto mit exportieren
  cancel: Abbrechen
  export: Exportieren
  saved: PDF gespeichert
  notebook: Notizbuch
  page: Seite
en:
  title: Export as PDF
  description: The page is exported as it is shown right now.
  paper: Paper size
  papers:
    auto: Like the page
    a4: A4
    letter: Letter
  orientation: Orientation
  orientations:
    auto: Like the page
    portrait: Portrait
    landscape: Landscape
  margin: Margin (mm)
  quality: Quality
  qualities:
    high: High
    medium: Medium
    low: Low (small file)
  showOriginal: Include the original photo
  cancel: Cancel
  export: Export
  saved: PDF saved
  notebook: Notebook
  page: Page
</i18n>
