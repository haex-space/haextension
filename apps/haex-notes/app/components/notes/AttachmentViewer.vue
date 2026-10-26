<script setup lang="ts">
import { useElementSize, useEventListener } from "@vueuse/core";
import { Download, Maximize2, PanelRightOpen, ScanSearch, X, ZoomIn, ZoomOut } from "@lucide/vue";
import { toast } from "vue-sonner";
import { formatBytes } from "~/lib/fileSize";
import { reportError } from "~/lib/errors";
import { fitView, panBy, zoomAt, type View } from "~/lib/zoomPan";
import { assetUrlAsync } from "~/composables/useElementImages";

/**
 * Zeigt einen Anhang der Seite, neben ihr oder im Vollbild (Spec 046, FR-023). Im Vollbild deckt er
 * alles ab: Die Seite, ihr Entwurf und das Original sind nicht zu sehen, bis er geschlossen wird.
 * Bilder haben Zoom und Verschieben; andere Dateien zeigen Name, Typ und Größe und lassen sich sichern.
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
const isImage = computed(() => attachment.value?.mimeType.startsWith("image/") ?? false);
/** Das Foto der Seite steht so da, wie der Schüler es zum Lesen gedreht hat. */
const rotation = computed(() => (attachment.value?.kind === "original" ? notebook.currentDoc?.paperImport?.rotation ?? 0 : 0));

const url = ref<string | null>(null);
const missing = ref(false);
const natural = ref({ width: 0, height: 0 });
let loading = 0;

watch(attachment, async (next, previous) => {
  if (next?.id === previous?.id) return;
  const mine = ++loading;
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = null;
  missing.value = false;
  natural.value = { width: 0, height: 0 };
  if (!next || !next.mimeType.startsWith("image/")) return;
  const loaded = await assetUrlAsync(assetStore, next.assetId).catch(() => null);
  if (mine !== loading) {
    if (loaded) URL.revokeObjectURL(loaded);
    return;
  }
  url.value = loaded;
  missing.value = loaded === null;
}, { immediate: true });
onBeforeUnmount(() => {
  loading++;
  if (url.value) URL.revokeObjectURL(url.value);
});

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
  if (event.key === "Escape" && viewer.open) viewer.close();
});

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
    class="flex flex-col bg-background"
    :class="full ? 'fixed inset-0 z-50' : 'w-[42%] min-w-72 shrink-0 border-l border-border'"
  >
    <header class="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium text-foreground">{{ attachment.name }}</div>
        <div class="truncate text-xs text-muted-foreground">
          {{ attachment.mimeType }}<template v-if="attachment.size !== undefined"> · {{ formatBytes(attachment.size, locale) }}</template>
        </div>
      </div>
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
</i18n>
