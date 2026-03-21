<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, ArrowLeft, Undo2, Redo2, Trash2, X, Settings, RotateCcw } from "lucide-vue-next";
import { PAGE_TEMPLATES } from "~/utils/pageTemplates";
import type { PageTemplate, PenSlot } from "~/database/schemas";

const route = useRoute();
const router = useRouter();
const localePath = useLocalePath();
const { t, locale } = useI18n();
const haexVault = useHaexVaultStore();
const notebook = useNotebookStore();
const pencilCase = usePencilCaseStore();

const isLoaded = ref(false);
const pageCanvasRef = useTemplateRef<any>("pageCanvasRef");
const selectedAddTemplate = ref<PageTemplate>("lined");

const pagesSidebarVisible = ref(false);

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
  await notebook.restorePageAsync(trashPreviewPage.value.id);
  trashPreviewPage.value = null;
};

// Pencil case config
const editingSlot = ref<PenSlot | null>(null);
const penTypes = [
  { value: "fineliner", de: "Fineliner", en: "Fineliner" },
  { value: "ballpoint", de: "Kugelschreiber", en: "Ballpoint" },
  { value: "pencil", de: "Bleistift", en: "Pencil" },
  { value: "highlighter", de: "Textmarker", en: "Highlighter" },
  { value: "eraser", de: "Radierer", en: "Eraser" },
] as const;

onMounted(async () => {
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
});

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

const addPage = async () => {
  await notebook.addPageAsync(selectedAddTemplate.value);
};

const openSlotEditor = (slot: PenSlot) => {
  editingSlot.value = { ...slot };
};

const saveSlotEdit = async () => {
  if (!editingSlot.value) return;
  await pencilCase.updateSlot(editingSlot.value.id, editingSlot.value);
  editingSlot.value = null;
};

const cancelSlotEdit = () => {
  editingSlot.value = null;
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

      <!-- Right: Undo/Redo -->
      <div class="flex items-center gap-0.5">
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

    <!-- Main area: Pencil Case + Page Canvas -->
    <div class="flex flex-1 min-h-0">
      <!-- Pencil Case (left toolbar, compact) -->
      <div class="flex shrink-0 flex-col items-center gap-0.5 border-r border-border bg-background px-1 py-2">
        <button
          v-for="slot in pencilCase.slots"
          :key="slot.id"
          class="flex size-10 items-center justify-center rounded-lg transition-all"
          :class="pencilCase.activeSlotId === slot.id
            ? 'ring-2 ring-primary shadow-md scale-110'
            : 'hover:bg-accent'"
          :title="slot.name"
          @click="pencilCase.selectSlot(slot.id)"
          @dblclick.stop="openSlotEditor(slot)"
        >
          <div
            class="rounded-full border border-border"
            :style="{
              backgroundColor: slot.type === 'eraser' ? '#ffffff' : slot.color,
              width: `${Math.max(8, Math.min(slot.size * 1.5, 28))}px`,
              height: `${Math.max(8, Math.min(slot.size * 1.5, 28))}px`,
              opacity: slot.type === 'highlighter' ? 0.5 : 1,
            }"
          />
        </button>

        <!-- Add slot button -->
        <button
          v-if="pencilCase.slots.length < pencilCase.maxSlots"
          class="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          @click="async () => { const s = await pencilCase.addSlot(); if (s) openSlotEditor(s); }"
        >
          <Plus class="size-5" />
        </button>

        <!-- Spacer -->
        <div class="flex-1" />

        <!-- Settings -->
        <button
          class="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="t('settings')"
          @click="router.push(localePath('/settings'))"
        >
          <Settings class="size-5" />
        </button>
      </div>

      <!-- Slot Editor (overlay panel) -->
      <div
        v-if="editingSlot"
        class="absolute left-16 top-16 z-50 w-64 rounded-xl border border-border bg-popover p-4 shadow-xl"
      >
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-semibold">{{ t('editPen') }}</span>
          <button class="rounded p-1 text-muted-foreground hover:text-foreground" @click="cancelSlotEdit">
            <X class="size-4" />
          </button>
        </div>

        <!-- Name -->
        <div class="mb-3">
          <label class="mb-1 block text-xs text-muted-foreground">{{ t('penName') }}</label>
          <input
            v-model="editingSlot.name"
            class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Type -->
        <div class="mb-3">
          <label class="mb-1 block text-xs text-muted-foreground">{{ t('penType') }}</label>
          <select
            v-model="editingSlot.type"
            class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option v-for="pt in penTypes" :key="pt.value" :value="pt.value">
              {{ locale === 'de' ? pt.de : pt.en }}
            </option>
          </select>
        </div>

        <!-- Color (not for eraser) -->
        <div v-if="editingSlot.type !== 'eraser'" class="mb-3">
          <label class="mb-1 block text-xs text-muted-foreground">{{ t('penColor') }}</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="c in ['#000000', '#1e40af', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#be185d', '#4b5563', '#facc15']"
              :key="c"
              class="size-7 rounded-md border-2 transition-transform hover:scale-110"
              :class="editingSlot.color === c ? 'border-foreground' : 'border-transparent'"
              :style="{ backgroundColor: c }"
              @click="editingSlot.color = c"
            />
          </div>
        </div>

        <!-- Size -->
        <div class="mb-4">
          <label class="mb-1 block text-xs text-muted-foreground">{{ t('penSize') }}: {{ editingSlot.size }}</label>
          <input
            v-model.number="editingSlot.size"
            type="range"
            :min="1"
            :max="32"
            class="w-full"
          />
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between">
          <button
            class="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            @click="pencilCase.removeSlot(editingSlot.id); editingSlot = null"
          >
            <Trash2 class="size-3.5" /> {{ t('deletePen') }}
          </button>
          <button
            class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            @click="saveSlotEdit"
          >
            {{ t('save') }}
          </button>
        </div>
      </div>

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
        />
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  addPage: Seite hinzufügen
  resetZoom: Zoom zurücksetzen
  trashPreview: Diese Seite ist im Papierkorb
  restore: Wiederherstellen
  settings: Einstellungen
  editPen: Stift bearbeiten
  penName: Name
  penType: Typ
  penColor: Farbe
  penSize: Stärke
  deletePen: Löschen
  save: Speichern
en:
  addPage: Add Page
  resetZoom: Reset Zoom
  trashPreview: This page is in the trash
  restore: Restore
  settings: Settings
  editPen: Edit Pen
  penName: Name
  penType: Type
  penColor: Color
  penSize: Size
  deletePen: Delete
  save: Save
</i18n>
