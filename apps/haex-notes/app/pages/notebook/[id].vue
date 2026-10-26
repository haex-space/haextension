<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, ArrowLeft, Undo2, Redo2, X, Table2, RotateCw, Share2, Camera, FileDown, Crop } from "@lucide/vue";
import { PAGE_TEMPLATES, templateLabel } from "~/utils/pageTemplates";
import type { PageTemplate, SelectPage } from "~/database/schemas";
import type PageCanvas from "~/components/notes/PageCanvas.vue";
import type { Box } from "~/lib/elementEdits";
import { getErrorMessage, reportError } from "~/lib/errors";
import { notebookShortcut, type NotebookShortcut } from "~/lib/shortcuts";

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const haexVault = useHaexVaultStore();
const notebook = useNotebookStore();
const pencilCase = usePencilCaseStore();

const isLoaded = ref(false);
const loadError = ref<string | null>(null);
const pageCanvasRef = useTemplateRef<InstanceType<typeof PageCanvas>>("pageCanvasRef");
const selectedAddTemplate = ref<PageTemplate>("lined");

const pagesSidebarVisible = ref(false);

const isLandscape = computed(() => {
  const doc = notebook.currentDoc;
  return !!doc && doc.width > doc.height;
});

// Per-page sharing (shares the currently open page)
const sharePageId = ref<string | null>(null);
const showPhotoImport = ref(false);
const showPdfExport = ref(false);
/** Das Rechteck, dessen Stelle ein Nahfoto neu liest; null beim Import einer ganzen Seite. */
const closeUpBox = ref<Box | null>(null);
const onAreaPicked = (box: Box) => {
  closeUpBox.value = box;
  showPhotoImport.value = true;
};
watch(showPhotoImport, (open) => { if (!open) closeUpBox.value = null; });
// Ein Rechteck gehört zu einer Fotoseite; auf der nächsten Seite wird wieder geschrieben.
watch(() => notebook.currentPage?.id, () => { pencilCase.pickingArea = false; });
const togglePickingArea = () => {
  if (pencilCase.pickingArea) pencilCase.pickingArea = false;
  else pencilCase.startPickingArea();
};
const showSharePageDialog = computed({
  get: () => sharePageId.value !== null,
  set: (v) => { if (!v) sharePageId.value = null; },
});
const openSharePage = () => {
  const id = notebook.currentPage?.id;
  if (id) sharePageId.value = id;
};

// Trash preview
const trashPreviewPage = ref<SelectPage | null>(null);

const onPreviewTrashPage = (page: SelectPage) => {
  trashPreviewPage.value = page;
};

const closeTrashPreview = () => {
  trashPreviewPage.value = null;
};

const restorePreviewedPage = async () => {
  if (!trashPreviewPage.value) return;
  const restoredId = trashPreviewPage.value.id;
  await notebook.restorePageAsync(restoredId);
  trashPreviewPage.value = null;
  const index = notebook.currentPages.findIndex((p) => p.id === restoredId);
  if (index >= 0) await notebook.goToPage(index);
};

const initAsync = async () => {
  loadError.value = null;
  try {
    await haexVault.initializeAsync();
    await pencilCase.loadAsync();

    const id = route.params.id as string;
    const success = await notebook.openNotebookAsync(id);
    if (!success) {
      router.replace("/");
      return;
    }
    selectedAddTemplate.value = (notebook.currentNotebook?.defaultTemplate as PageTemplate) ?? "lined";
    isLoaded.value = true;
  } catch (err) {
    console.error("[haex-notes] Failed to open notebook:", err);
    loadError.value = getErrorMessage(err);
  }
};

onMounted(initAsync);

// Ein fehlgeschlagenes SDK-Setup lässt sich im selben Frame nicht wiederholen.
const reloadFrame = () => window.location.reload();

// Auto-save
const autoSaveInterval = ref<ReturnType<typeof setInterval>>();
onMounted(() => {
  autoSaveInterval.value = setInterval(async () => {
    if (notebook.isDirty) {
      try {
        await notebook.saveCurrentPageAsync();
      } catch (e) {
        console.error("[haex-notes] Auto-save failed:", e);
      }
    }
  }, 10_000);
});
onUnmounted(() => {
  if (autoSaveInterval.value) clearInterval(autoSaveInterval.value);
});

// Save before leaving
onBeforeUnmount(async () => {
  if (notebook.isDirty) {
    await notebook.saveCurrentPageAsync();
  }
});

const shortcutActions: Record<NotebookShortcut, () => Promise<void>> = {
  save: () => notebook.saveCurrentPageAsync(),
  undo: () => notebook.undo(),
  redo: () => notebook.redo(),
};

useEventListener(window, "keydown", (e: KeyboardEvent) => {
  const shortcut = notebookShortcut(e);
  if (!shortcut) return;
  e.preventDefault();
  shortcutActions[shortcut]().catch(reportError);
});

const goBack = async () => {
  if (notebook.isDirty) await notebook.saveCurrentPageAsync();
  router.push("/");
};

const onTableSelect = (rows: number, cols: number) => {
  // Place table in the upper-left area of the page with some margin
  notebook.addTable(rows, cols, 80, 80);
};

const addPage = async () => {
  await notebook.addPageAsync(selectedAddTemplate.value);
};
</script>

<template>
  <div v-if="isLoaded" class="flex h-full w-full flex-col bg-background">
    <!-- Top Bar (compact) -->
    <header class="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
      <!-- Left: Back + Name -->
      <div class="flex items-center gap-1">
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          @click="goBack"
        >
          <ArrowLeft class="size-4" />
        </button>
        <span class="text-xs font-medium text-foreground truncate max-w-32">{{ notebook.currentNotebook?.name }}</span>
      </div>

      <!-- Center: Page navigation -->
      <div class="flex items-center gap-0.5">
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          :disabled="notebook.currentPageIndex <= 0"
          @click="notebook.prevPage()"
        >
          <ChevronLeft class="size-4" />
        </button>
        <!-- Page counter → click toggles pages sidebar -->
        <button
          class="min-w-12 rounded px-1.5 py-0.5 text-center text-xs tabular-nums transition-colors"
          :class="pagesSidebarVisible
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
          @click="pagesSidebarVisible = !pagesSidebarVisible"
        >
          {{ notebook.currentPageIndex + 1 }}/{{ notebook.pageCount }}
        </button>
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          :disabled="notebook.currentPageIndex >= notebook.pageCount - 1"
          @click="notebook.nextPage()"
        >
          <ChevronRight class="size-4" />
        </button>
        <!-- Add Page: Button Group -->
        <ShadcnButtonGroup>
          <button
            class="rounded-l-lg border border-border px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            :title="t('addPage')"
            @click="addPage"
          >
            <Plus class="size-5" />
          </button>
          <ShadcnDropdownMenu>
            <ShadcnDropdownMenuTrigger as-child>
              <button class="rounded-r-lg border border-l-0 border-border px-1.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <ChevronDown class="size-4" />
              </button>
            </ShadcnDropdownMenuTrigger>
            <ShadcnDropdownMenuContent align="center">
              <ShadcnDropdownMenuItem
                v-for="tmpl in PAGE_TEMPLATES"
                :key="tmpl.id"
                :class="selectedAddTemplate === tmpl.id ? 'bg-accent' : ''"
                @click="selectedAddTemplate = tmpl.id"
              >
                {{ templateLabel(tmpl.id, locale) }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuContent>
          </ShadcnDropdownMenu>
        </ShadcnButtonGroup>
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="t('importPhoto')"
          @click="showPhotoImport = true"
        >
          <Camera class="size-5" />
        </button>
        <button
          v-if="notebook.currentDoc?.paperImport"
          class="rounded p-1.5 hover:bg-accent hover:text-foreground"
          :class="pencilCase.pickingArea ? 'bg-accent text-foreground' : 'text-muted-foreground'"
          :title="t('closeUp')"
          @click="togglePickingArea"
        >
          <Crop class="size-5" />
        </button>
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="t('exportPdf')"
          @click="showPdfExport = true"
        >
          <FileDown class="size-5" />
        </button>
        <NotesPaperViewSwitch class="ml-1" />
      </div>

      <!-- Right: Table + Undo/Redo -->
      <div class="flex items-center gap-0.5">
        <!-- Orientation toggle -->
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="t('toggleOrientation')"
          @click="notebook.togglePageOrientationAsync()"
        >
          <RotateCw class="size-4" :class="isLandscape ? 'rotate-90' : ''" />
        </button>

        <NotesPageBackgroundMenu />

        <!-- Share current page -->
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="t('sharePage')"
          @click="openSharePage"
        >
          <Share2 class="size-4" />
        </button>

        <!-- Table tool -->
        <ShadcnPopover>
          <ShadcnPopoverTrigger as-child>
            <button
              class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              :title="t('addTable')"
            >
              <Table2 class="size-4" />
            </button>
          </ShadcnPopoverTrigger>
          <ShadcnPopoverContent align="end" class="w-auto p-0">
            <NotesTableGridPicker @select="onTableSelect" />
          </ShadcnPopoverContent>
        </ShadcnPopover>

        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          :disabled="!notebook.canUndo"
          @click="notebook.undo()"
        >
          <Undo2 class="size-4" />
        </button>
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
          :disabled="!notebook.canRedo"
          @click="notebook.redo()"
        >
          <Redo2 class="size-4" />
        </button>
      </div>
    </header>

    <NotesPaperNoteImportDialog v-model:open="showPhotoImport" :close-up-box="closeUpBox" />
    <NotesPdfExportDialog v-model:open="showPdfExport" />
    <NotesShareDialog
      v-if="sharePageId"
      v-model:open="showSharePageDialog"
      :notebook-id="(route.params.id as string)"
      :page-id="sharePageId"
    />

    <!-- Main area: Pencil Case + Page Canvas -->
    <div class="flex flex-1 min-h-0">
      <!-- Pencil Case (left toolbar, compact) -->
      <NotesPencilCase />

      <!-- Page Canvas -->
      <div class="relative flex-1 min-w-0 overflow-auto bg-muted/30">
        <!-- Trash Preview Overlay -->
        <div v-if="trashPreviewPage" class="absolute inset-0 z-20 flex flex-col bg-muted/30">
          <div class="flex items-center justify-between bg-amber-500/90 px-4 py-2 text-sm font-medium text-white">
            <span>{{ t('trashPreview') }}</span>
            <div class="flex items-center gap-2">
              <button
                class="rounded-md bg-white/20 px-3 py-1 text-xs hover:bg-white/30"
                @click="restorePreviewedPage"
              >
                {{ t('restore') }}
              </button>
              <button
                class="rounded-md bg-white/20 px-2 py-1 hover:bg-white/30"
                @click="closeTrashPreview"
              >
                <X class="size-4" />
              </button>
            </div>
          </div>
          <NotesTrashPagePreview :page="trashPreviewPage" class="flex-1" />
        </div>

        <NotesPageCanvas ref="pageCanvasRef" @area-picked="onAreaPicked" />

        <!-- Zoom indicator (bottom right) -->
        <button
          v-if="pageCanvasRef"
          class="absolute bottom-3 right-3 rounded-lg bg-background/80 px-2.5 py-1 text-xs tabular-nums text-muted-foreground shadow backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
          :title="t('resetZoom')"
          @click="pageCanvasRef.resetZoom()"
        >
          {{ pageCanvasRef.zoomPercent }}%
        </button>
      </div>

      <!-- Pages Sidebar (right) -->
      <div
        class="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
        :class="pagesSidebarVisible ? 'w-52' : 'w-0'"
      >
        <NotesPagesSidebar
          v-if="pagesSidebarVisible"
          @close="pagesSidebarVisible = false"
          @preview-trash-page="onPreviewTrashPage"
          @trash-restored="async (pageId: string) => {
            const wasPreviewingThis = trashPreviewPage?.id === pageId;
            trashPreviewPage = null;
            if (!wasPreviewingThis) return;
            const index = notebook.currentPages.findIndex(p => p.id === pageId);
            if (index >= 0) await notebook.goToPage(index);
          }"
        />
      </div>
    </div>
  </div>
  <div v-else-if="loadError" class="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
    <p class="text-sm font-medium text-destructive">{{ t("loadError") }}</p>
    <p class="max-w-md text-xs text-muted-foreground">{{ loadError }}</p>
    <div class="flex items-center gap-2">
      <button
        class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        @click="reloadFrame"
      >
        {{ t("retry") }}
      </button>
      <button
        class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        @click="router.push('/')"
      >
        {{ t("backToList") }}
      </button>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  addPage: Seite hinzufügen
  importPhoto: Foto importieren
  exportPdf: Als PDF exportieren
  closeUp: Stelle neu fotografieren – Rechteck über die Stelle ziehen
  addTable: Tabelle einfügen
  toggleOrientation: Hoch-/Querformat
  sharePage: Seite teilen
  resetZoom: Zoom zurücksetzen
  loadError: Notizbuch konnte nicht geöffnet werden
  retry: Erneut versuchen
  backToList: Zurück zur Übersicht
  trashPreview: Diese Seite ist im Papierkorb
  restore: Wiederherstellen
en:
  loadError: Failed to open notebook
  retry: Retry
  backToList: Back to overview
  addPage: Add Page
  importPhoto: Import a photo
  exportPdf: Export as PDF
  closeUp: Photograph an area again – drag a rectangle over it
  addTable: Insert Table
  toggleOrientation: Portrait/Landscape
  sharePage: Share page
  resetZoom: Reset Zoom
  trashPreview: This page is in the trash
  restore: Restore
</i18n>
