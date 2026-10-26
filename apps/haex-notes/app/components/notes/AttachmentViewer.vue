<script setup lang="ts">
import { useElementSize, useEventListener } from "@vueuse/core";
import { ChevronLeft, ChevronRight, Download, Maximize2, PanelRightOpen, ScanSearch, X, ZoomIn, ZoomOut } from "@lucide/vue";
import { toast } from "vue-sonner";
import { formatBytes } from "~/lib/fileSize";
import { reportError } from "~/lib/errors";
import { isPdf, openPdfAsync, type PdfFile } from "~/lib/pdf";
import { SPLIT, splitFraction } from "~/lib/splitPane";
import { fitView, panBy, zoomAt, type View } from "~/lib/zoomPan";
import { assetUrlAsync } from "~/composables/useElementImages";

/**
 * Zeigt einen Anhang der Seite, neben ihr oder im Vollbild (Spec 046, FR-023). Im Vollbild deckt er
 * alles ab: Die Seite, ihr Entwurf und das Original sind nicht zu sehen, bis er geschlossen wird.
 * Bilder und die Seiten eines PDF haben Zoom und Verschieben (ein PDF zeigt eine Seite nach der anderen);
 * andere Dateien zeigen Name, Typ und Größe und lassen sich sichern.
 */
const { t, locale } = useI18n();
const notebook = useNotebookStore();
const viewer = useAttachmentViewerStore();
const assetStore = useAssetStore();
const haexVault = useHaexVaultStore();

const attachment = computed(() => {
  const open = viewer.open;
  return open ? notebook.currentDoc?.attachments?.find((a) => a.id === open.attachmentId) ?? null : null;
});
const full = computed(() => viewer.open?.mode === "full");
const pdf = computed(() => (attachment.value ? isPdf(attachment.value) : false));
const isImage = computed(() => (attachment.value?.mimeType.startsWith("image/") ?? false) || pdf.value);
/** Das Foto der Seite steht so da, wie der Schüler es zum Lesen gedreht hat. */
const rotation = computed(() => (attachment.value?.kind === "original" ? notebook.currentDoc?.paperImport?.rotation ?? 0 : 0));

const url = ref<string | null>(null);
const missing = ref(false);
const unreadable = ref(false);
const natural = ref({ width: 0, height: 0 });
const pageIndex = ref(0);
const pageCount = ref(0);
let file: PdfFile | null = null;
let loading = 0;

/** Zeigt ein anderes Bild und gibt die Object-URL des vorigen frei. */
function showUrl(next: string | null) {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = next;
}
function closeFile() {
  file?.destroy();
  file = null;
}

/** Rastert die Seite eines PDF und zeigt sie; eine neuere Anfrage lässt eine ältere verfallen. */
async function showPageAsync(index: number, mine: number) {
  if (!file) return;
  const blob = await file.renderPageAsync(index).catch(() => null);
  if (mine !== loading) return;
  if (!blob) {
    unreadable.value = true;
    return;
  }
  natural.value = { width: 0, height: 0 };
  showUrl(URL.createObjectURL(blob));
}

watch(attachment, async (next, previous) => {
  if (next?.id === previous?.id) return;
  const mine = ++loading;
  closeFile();
  showUrl(null);
  missing.value = false;
  unreadable.value = false;
  natural.value = { width: 0, height: 0 };
  pageIndex.value = 0;
  pageCount.value = 0;
  if (!next) return;
  if (isPdf(next)) {
    const bytes = await assetStore.readAsync(next.assetId).catch(() => null);
    if (mine !== loading) return;
    if (!bytes) {
      missing.value = true;
      return;
    }
    const opened = await openPdfAsync(bytes).catch(() => null);
    if (mine !== loading) {
      opened?.destroy();
      return;
    }
    if (!opened) {
      unreadable.value = true;
      return;
    }
    file = opened;
    pageCount.value = opened.pageCount;
    await showPageAsync(0, mine);
    return;
  }
  if (!next.mimeType.startsWith("image/")) return;
  const loaded = await assetUrlAsync(assetStore, next.assetId).catch(() => null);
  if (mine !== loading) {
    if (loaded) URL.revokeObjectURL(loaded);
    return;
  }
  showUrl(loaded);
  missing.value = loaded === null;
}, { immediate: true });
onBeforeUnmount(() => {
  loading++;
  closeFile();
  showUrl(null);
});

function turnPage(step: number) {
  const next = pageIndex.value + step;
  if (!file || next < 0 || next >= pageCount.value) return;
  pageIndex.value = next;
  void showPageAsync(next, ++loading);
}

const stage = useTemplateRef<HTMLElement>("stage");
const { width: stageWidth, height: stageHeight } = useElementSize(stage);
/** Die Größe des Bildes, wie es auf dem Betrachter steht (nach der Drehung). */
const content = computed(() => {
  const { width, height } = natural.value;
  return rotation.value === 90 || rotation.value === 270 ? { width: height, height: width } : { width, height };
});
const box = computed(() => ({ width: stageWidth.value, height: stageHeight.value }));
const fitted = computed(() => fitView(box.value, content.value));
const view = ref<View>({ scale: 1, x: 0, y: 0 });
const fit = () => { view.value = fitted.value; };
// Neu einpassen, wenn das Bild geladen ist, der Betrachter seine Größe ändert (Seitenfenster, Vollbild)
// oder das Bild gedreht steht; was der Schüler danach zoomt, bleibt, bis eines davon wieder passiert.
watch([content, box], fit);

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return;
  const factor = Math.exp(-event.deltaY * 0.0015);
  view.value = zoomAt(view.value, factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }, fitted.value.scale);
}
function zoomBy(factor: number) {
  view.value = zoomAt(view.value, factor, { x: stageWidth.value / 2, y: stageHeight.value / 2 }, fitted.value.scale);
}
let last: { x: number; y: number } | null = null;
function onPointerDown(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  last = { x: event.clientX, y: event.clientY };
}
function onPointerMove(event: PointerEvent) {
  if (!last) return;
  view.value = panBy(view.value, event.clientX - last.x, event.clientY - last.y);
  last = { x: event.clientX, y: event.clientY };
}
const onPointerUp = () => { last = null; };

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (!viewer.open) return;
  if (event.key === "Escape") viewer.close();
  else if (pdf.value && event.key === "PageDown") turnPage(1);
  else if (pdf.value && event.key === "PageUp") turnPage(-1);
});

// Die Trennlinie zwischen Seite und Anhang: ziehen ändert die Teilung, ein Doppelklick stellt sie zurück.
const panel = useTemplateRef<HTMLElement>("panel");
let dragging = false;
function onDividerDown(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragging = true;
}
function onDividerMove(event: PointerEvent) {
  const area = panel.value?.parentElement?.getBoundingClientRect();
  if (dragging && area) viewer.setSideFraction(splitFraction(event.clientX, area));
}
const onDividerUp = () => { dragging = false; };

async function saveAsync() {
  const file = attachment.value;
  if (!file) return;
  try {
    const bytes = await assetStore.readAsync(file.assetId);
    if (!bytes) {
      toast.error(t("fileMissing"));
      return;
    }
    const saved = await haexVault.client.filesystem.saveFileAsync(bytes, { defaultPath: file.name, title: t("save") });
    if (saved) toast.success(t("saved"));
  } catch (error) {
    reportError(error);
  }
}
</script>

<template>
  <aside
    v-if="attachment"
    ref="panel"
    class="flex flex-col bg-background"
    :class="full ? 'fixed inset-0 z-50' : 'relative min-w-72 shrink-0 border-l border-border'"
    :style="full ? undefined : { width: `${viewer.sideFraction * 100}%` }"
  >
    <div
      v-if="!full"
      class="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none select-none hover:bg-primary/40"
      role="separator"
      aria-orientation="vertical"
      :title="t('resize')"
      @pointerdown="onDividerDown"
      @pointermove="onDividerMove"
      @pointerup="onDividerUp"
      @pointercancel="onDividerUp"
      @dblclick="viewer.setSideFraction(SPLIT.default)"
    />
    <header class="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium text-foreground">{{ attachment.name }}</div>
        <div class="truncate text-xs text-muted-foreground">
          {{ attachment.mimeType }}<template v-if="attachment.size !== undefined"> · {{ formatBytes(attachment.size, locale) }}</template>
        </div>
      </div>
      <template v-if="pdf && pageCount > 1">
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          :title="t('previousPage')" :disabled="pageIndex === 0" @click="turnPage(-1)"
        >
          <ChevronLeft class="size-4" />
        </button>
        <span class="min-w-12 text-center text-xs tabular-nums text-muted-foreground">{{ pageIndex + 1 }} / {{ pageCount }}</span>
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          :title="t('nextPage')" :disabled="pageIndex >= pageCount - 1" @click="turnPage(1)"
        >
          <ChevronRight class="size-4" />
        </button>
      </template>
      <template v-if="isImage && url">
        <button class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" :title="t('zoomOut')" @click="zoomBy(1 / 1.25)">
          <ZoomOut class="size-4" />
        </button>
        <button class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" :title="t('zoomIn')" @click="zoomBy(1.25)">
          <ZoomIn class="size-4" />
        </button>
        <button class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" :title="t('fit')" @click="fit">
          <ScanSearch class="size-4" />
        </button>
      </template>
      <button class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" :title="t('save')" @click="saveAsync">
        <Download class="size-4" />
      </button>
      <button
        class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        :title="full ? t('beside') : t('fullscreen')"
        @click="viewer.show(attachment.id, full ? 'side' : 'full')"
      >
        <PanelRightOpen v-if="full" class="size-4" />
        <Maximize2 v-else class="size-4" />
      </button>
      <button class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" :title="t('close')" @click="viewer.close()">
        <X class="size-4" />
      </button>
    </header>

    <div
      v-if="isImage && url"
      ref="stage"
      class="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-muted/30"
      style="cursor: grab"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div
        class="absolute left-0 top-0 origin-top-left"
        :style="{ width: `${content.width}px`, height: `${content.height}px`, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }"
      >
        <img
          :src="url"
          :alt="attachment.name"
          draggable="false"
          class="absolute max-w-none"
          :style="{
            width: `${natural.width}px`, height: `${natural.height}px`,
            left: `${(content.width - natural.width) / 2}px`, top: `${(content.height - natural.height) / 2}px`,
            transform: `rotate(${rotation}deg)`,
          }"
          @load="(e) => (natural = { width: (e.target as HTMLImageElement).naturalWidth, height: (e.target as HTMLImageElement).naturalHeight })"
        >
      </div>
    </div>
    <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      <template v-if="missing">{{ t('fileMissing') }}</template>
      <template v-else-if="unreadable">{{ t('unreadable') }}</template>
      <template v-else-if="!isImage">{{ t('noPreview') }}</template>
      <template v-else>{{ t('loading') }}</template>
    </div>
  </aside>
</template>

<i18n lang="yaml">
de:
  zoomIn: Vergrößern
  zoomOut: Verkleinern
  fit: Ganz anzeigen
  save: Als Datei sichern
  saved: Gesichert
  fullscreen: Vollbild – nur der Anhang ist zu sehen
  beside: Neben der Seite anzeigen
  close: Schließen
  fileMissing: Die Datei liegt auf diesem Gerät nicht.
  noPreview: Diese Datei lässt sich hier nicht anzeigen. Sichere sie als Datei und öffne sie damit.
  loading: Wird geladen …
  unreadable: Diese Datei lässt sich nicht lesen. Sichere sie als Datei und öffne sie mit einer anderen App.
  previousPage: Vorige Seite
  nextPage: Nächste Seite
  resize: Ziehen ändert die Breite, Doppelklick stellt sie zurück
en:
  zoomIn: Zoom in
  zoomOut: Zoom out
  fit: Fit
  save: Save as file
  saved: Saved
  fullscreen: Full screen – only the attachment is shown
  beside: Show beside the page
  close: Close
  fileMissing: The file is not on this device.
  noPreview: This file cannot be shown here. Save it as a file and open it with another app.
  loading: Loading …
  unreadable: This file cannot be read. Save it as a file and open it with another app.
  previousPage: Previous page
  nextPage: Next page
  resize: Drag to change the width, double click to reset
</i18n>
