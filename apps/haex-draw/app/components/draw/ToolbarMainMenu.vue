<script setup lang="ts">
import {
  Menu,
  FilePlus,
  FolderOpen,
} from "@lucide/vue";

const { t } = useI18n();
const router = useRouter();
const localePath = useLocalePath();
const canvas = useCanvasStore();
const { listAsync } = useDrawingPersistence();

const recentDrawings = ref<{ id: string; name: string; thumbnail: string | null }[]>([]);
const loadRecent = async () => {
  const all = await listAsync();
  recentDrawings.value = all
    .reverse()
    .filter(d => d.id !== canvas.drawingId)
    .slice(0, 5)
    .map(d => ({ id: d.id, name: d.name, thumbnail: d.thumbnail }));
};

const goToOverview = () => router.push(localePath("/"));
const openDrawing = (id: string) => router.push(localePath(`/draw/${id}`));
const newDrawing = () => router.push(localePath("/draw/new"));
</script>

<template>
  <ShadcnDropdownMenu @update:open="(open: boolean) => { if (open) loadRecent(); }">
    <ShadcnDropdownMenuTrigger as-child>
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        :title="t('menu')"
      >
        <Menu class="size-6" />
      </button>
    </ShadcnDropdownMenuTrigger>
    <ShadcnDropdownMenuContent side="right" align="start" :side-offset="8" class="min-w-52">
      <ShadcnDropdownMenuItem @click="newDrawing">
        <FilePlus class="mr-2 size-4" /> {{ t("newDrawing") }}
      </ShadcnDropdownMenuItem>
      <ShadcnDropdownMenuSeparator />
      <template v-if="recentDrawings.length > 0">
        <ShadcnDropdownMenuItem
          v-for="d in recentDrawings"
          :key="d.id"
          @click="openDrawing(d.id)"
        >
          <img
            v-if="d.thumbnail"
            :src="d.thumbnail"
            class="mr-2 size-6 shrink-0 rounded border border-border object-contain bg-white"
          />
          <div v-else class="mr-2 flex size-6 shrink-0 items-center justify-center rounded border border-border bg-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-muted-foreground/40">
              <path d="M5 19 C7 15, 12 12, 19 5" stroke-linecap="round" />
            </svg>
          </div>
          <span class="truncate">{{ d.name }}</span>
        </ShadcnDropdownMenuItem>
        <ShadcnDropdownMenuSeparator />
      </template>
      <ShadcnDropdownMenuItem @click="goToOverview">
        <FolderOpen class="mr-2 size-4" /> {{ t("allDrawings") }}
      </ShadcnDropdownMenuItem>
    </ShadcnDropdownMenuContent>
  </ShadcnDropdownMenu>
</template>

<i18n lang="yaml">
de:
  menu: Menü
  newDrawing: Neue Zeichnung
  allDrawings: Alle Zeichnungen
en:
  menu: Menu
  newDrawing: New Drawing
  allDrawings: All Drawings
</i18n>
