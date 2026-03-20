<script setup lang="ts">
import { Plus, Paintbrush } from "lucide-vue-next";
import type { SelectDrawing } from "~/database/schemas";

const { t } = useI18n();
const router = useRouter();
const localePath = useLocalePath();
const haexVault = useHaexVaultStore();
const paletteStore = usePaletteStore();
const { listAsync, deleteAsync, saveAsync, loadAsync } = useDrawingPersistence();

const drawings = ref<SelectDrawing[]>([]);
const isLoaded = ref(false);

const loadDrawings = async () => {
  drawings.value = (await listAsync()).reverse(); // newest first
};

onMounted(async () => {
  await haexVault.initializeAsync();
  await paletteStore.loadAsync();
  await loadDrawings();
  isLoaded.value = true;
});

const createNewDrawing = () => {
  router.push(localePath("/draw/new"));
};

const openDrawing = (id: string) => {
  router.push(localePath(`/draw/${id}`));
};

const renameDrawing = async (id: string, name: string) => {
  const db = haexVault.orm;
  if (!db) return;
  const { drawings: drawingsTable } = await import("~/database/schemas");
  const { eq } = await import("drizzle-orm");
  await db.update(drawingsTable).set({ name }).where(eq(drawingsTable.id, id));
  await loadDrawings();
};

const duplicateDrawing = async (id: string) => {
  const original = await loadAsync(id);
  if (!original) return;
  const db = haexVault.orm;
  if (!db) return;
  const { drawings: drawingsTable } = await import("~/database/schemas");
  const newId = crypto.randomUUID();
  await db.insert(drawingsTable).values({
    id: newId,
    name: `${original.name} (Kopie)`,
    strokes: original.strokes,
    stencils: original.stencils,
    viewport: original.viewport,
    thumbnail: original.thumbnail,
  });
  await loadDrawings();
};

const onDeleteDrawing = async (id: string) => {
  if (!confirm(t("confirmDelete"))) return;
  await deleteAsync(id);
  await loadDrawings();
};
</script>

<template>
  <div v-if="isLoaded" class="flex h-full flex-col bg-background">
    <!-- Header -->
    <header class="flex items-center justify-between border-b border-border px-6 py-4">
      <div class="flex items-center gap-3">
        <Paintbrush class="size-6 text-primary" />
        <h1 class="text-xl font-semibold text-foreground">haex-draw</h1>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        @click="createNewDrawing"
      >
        <Plus class="size-4" />
        {{ t("newDrawing") }}
      </button>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Empty state -->
      <div v-if="drawings.length === 0" class="flex h-full flex-col items-center justify-center gap-4">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" class="text-muted-foreground/20">
          <path d="M5 19 C7 15, 10 12, 12 14 C14 16, 17 9, 19 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <rect x="2" y="2" width="20" height="20" rx="3" stroke="currentColor" stroke-width="1" />
        </svg>
        <p class="text-sm text-muted-foreground">{{ t("emptyState") }}</p>
        <button
          class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          @click="createNewDrawing"
        >
          <Plus class="size-4" />
          {{ t("createFirst") }}
        </button>
      </div>

      <!-- Drawing Grid -->
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <DrawDrawingCard
          v-for="drawing in drawings"
          :key="drawing.id"
          :drawing="drawing"
          @open="openDrawing"
          @rename="renameDrawing"
          @duplicate="duplicateDrawing"
          @delete="onDeleteDrawing"
        />
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  newDrawing: Neue Zeichnung
  emptyState: Noch keine Zeichnungen vorhanden
  createFirst: Erstelle deine erste Zeichnung
  confirmDelete: Diese Zeichnung wirklich löschen?
en:
  newDrawing: New Drawing
  emptyState: No drawings yet
  createFirst: Create your first drawing
  confirmDelete: Really delete this drawing?
</i18n>
