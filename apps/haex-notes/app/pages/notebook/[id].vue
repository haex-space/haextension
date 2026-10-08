<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, ArrowLeft, Undo2, Redo2, X, RotateCcw, Table2, RotateCw, Share2 } from "@lucide/vue";
import { PAGE_TEMPLATES } from "~/utils/pageTemplates";
import type { PageTemplate } from "~/database/schemas";

const route = useRoute();
const router = useRouter();
const localePath = useLocalePath();
const { t, locale } = useI18n();
const haexVault = useHaexVaultStore();
const notebook = useNotebookStore();
const pencilCase = usePencilCaseStore();

const isLoaded = ref(false);
const loadError = ref<string | null>(null);
const pageCanvasRef = useTemplateRef<any>("pageCanvasRef");
const selectedAddTemplate = ref<PageTemplate>("lined");

const pagesSidebarVisible = ref(false);

// Per-page sharing (shares the currently open page)
const sharePageId = ref<string | null>(null);
const showSharePageDialog = computed({
  get: () => sharePageId.value !== null,
  set: (v) => { if (!v) sharePageId.value = null; },
});
const openSharePage = () => {
  const id = notebook.currentPage?.id;
  if (id) sharePageId.value = id;
};

// Trash preview
const trashPreviewPage = ref<any>(null);

const onPreviewTrashPage = (page: any) => {
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
      router.replace(localePath("/"));
      return;
    }
    selectedAddTemplate.value = (notebook.currentNotebook?.defaultTemplate as PageTemplate) ?? "lined";
    isLoaded.value = true;
  } catch (err) {
    console.error("[haex-notes] Failed to open notebook:", err);
    loadError.value = err instanceof Error ? err.message : String(err);
  }
};

onMounted(initAsync);

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

// Keyboard shortcuts
useEventListener(window, "keydown", (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    notebook.saveCurrentPageAsync();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    notebook.undo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
    e.preventDefault();
    notebook.redo();
  }
});

const goBack = async () => {
  if (notebook.isDirty) await notebook.saveCurrentPageAsync();
  router.push(localePath("/"));
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
                {{ locale === 'de' ? tmpl.i18n.de : tmpl.i18n.en }}
              </ShadcnDropdownMenuItem>
            </ShadcnDropdownMenuContent>
          </ShadcnDropdownMenu>
        </ShadcnButtonGroup>
      </div>

      <!-- Right: Table + Undo/Redo -->
      <div class="flex items-center gap-0.5">
        <!-- Orientation toggle -->
        <button
          class="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="t('toggleOrientation')"
          @click="notebook.togglePageOrientationAsync()"
        >
          <RotateCw class="size-4" :class="(notebook.currentPage as any)?.orientation === 'landscape' ? 'rotate-90' : ''" />
        </button>

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
            <NotesTableGridPicker @select="onTableSelect" @cancel="" />
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

        <NotesPageCanvas ref="pageCanvasRef" />

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
        @click="initAsync"
      >
        {{ t("retry") }}
      </button>
      <button
        class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        @click="router.push(localePath('/'))"
      >
        {{ t("backToList") }}
      </button>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  addPage: Seite hinzufügen
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
  addTable: Insert Table
  toggleOrientation: Portrait/Landscape
  sharePage: Share page
  resetZoom: Reset Zoom
  trashPreview: This page is in the trash
  restore: Restore
</i18n>
