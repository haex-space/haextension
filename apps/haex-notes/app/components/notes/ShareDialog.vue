<template>
  <UiDrawerModal v-model:open="isOpen" :title="isPageMode ? t('pageTitle') : t('title')" :description="isPageMode ? t('pageDescription') : t('description')">
    <template #content>
      <div class="space-y-6 p-4">
        <!-- Loading -->
        <div v-if="isLoadingSpaces" class="flex items-center justify-center py-8">
          <Loader2 class="w-5 h-5 animate-spin text-primary" />
        </div>

        <template v-else>
          <div>
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {{ t('availableSpaces') }}
            </h3>

            <div v-if="availableSpaces.length > 0" class="space-y-2">
              <button
                v-for="space in availableSpaces"
                :key="space.id"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                :class="isSpaceAssigned(space.id)
                  ? 'bg-primary/10 border border-primary/30'
                  : 'bg-muted hover:bg-muted/80'"
                :disabled="isProcessing"
                @click="toggleSpaceAssignment(space)"
              >
                <div
                  class="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                  :class="isSpaceAssigned(space.id)
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/30'"
                >
                  <Check v-if="isSpaceAssigned(space.id)" class="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-medium truncate block">{{ space.name }}</span>
                  <span v-if="space.originUrl" class="text-xs text-muted-foreground truncate block">{{ space.originUrl }}</span>
                </div>
                <span
                  v-if="space.originUrl"
                  class="text-xs px-1.5 py-0.5 rounded-full shrink-0 bg-primary/10 text-primary"
                >
                  online
                </span>
                <span
                  v-else
                  class="text-xs px-1.5 py-0.5 rounded-full shrink-0 bg-muted-foreground/10 text-muted-foreground"
                >
                  local
                </span>
              </button>
            </div>

            <p v-else class="text-sm text-muted-foreground text-center py-4">
              {{ t('noSpaces') }}
            </p>
          </div>
        </template>

        <p v-if="errorMessage" class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {{ errorMessage }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <button class="text-muted-foreground px-3 py-2 text-sm" @click="isOpen = false">
          {{ t('close') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { Check, Loader2 } from "lucide-vue-next";
import type { SpaceAssignment, DecryptedSpace } from "@haex-space/vault-sdk";

const props = defineProps<{
  notebookId: string;
  /** When set, the dialog shares this single page (+ notebook context) instead of the whole notebook. */
  pageId?: string;
}>();

const isPageMode = computed(() => !!props.pageId);

const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const spacesStore = useSpacesStore();

const availableSpaces = ref<DecryptedSpace[]>([]);
const assignments = ref<SpaceAssignment[]>([]);
const isLoadingSpaces = ref(false);
const isProcessing = ref(false);
const errorMessage = ref("");

watch(isOpen, async (open) => {
  if (open) {
    errorMessage.value = "";
    await loadDataAsync();
  }
}, { immediate: true });

function isSpaceAssigned(spaceId: string): boolean {
  return assignments.value.some((assignment) => assignment.spaceId === spaceId);
}

async function loadDataAsync() {
  isLoadingSpaces.value = true;
  try {
    const [spacesResult, assignmentsResult] = await Promise.all([
      spacesStore.listWritableSpacesAsync(),
      isPageMode.value
        ? spacesStore.getPageAssignmentsAsync(props.pageId!)
        : spacesStore.getNotebookAssignmentsAsync(props.notebookId),
    ]);
    availableSpaces.value = spacesResult;
    assignments.value = assignmentsResult;
  } catch (err) {
    console.warn("[haex-notes] Failed to load share dialog data:", err);
    errorMessage.value = t("loadFailed");
  } finally {
    isLoadingSpaces.value = false;
  }
}

async function toggleSpaceAssignment(space: DecryptedSpace) {
  if (isProcessing.value) return;

  isProcessing.value = true;
  errorMessage.value = "";
  const wasAssigned = isSpaceAssigned(space.id);
  try {
    if (wasAssigned) {
      if (isPageMode.value) await spacesStore.unsharePagesFromSpaceAsync(props.notebookId, [props.pageId!], space.id);
      else await spacesStore.unshareNotebookFromSpaceAsync(props.notebookId, space.id);
    } else {
      if (isPageMode.value) await spacesStore.sharePagesWithSpaceAsync(props.notebookId, [props.pageId!], space.id);
      else await spacesStore.shareNotebookWithSpaceAsync(props.notebookId, space.id);
    }
    assignments.value = isPageMode.value
      ? await spacesStore.getPageAssignmentsAsync(props.pageId!)
      : await spacesStore.getNotebookAssignmentsAsync(props.notebookId);
  } catch (err) {
    console.error("[haex-notes] Toggle space assignment failed:", err);
    errorMessage.value = wasAssigned ? t("unshareFailed") : t("shareFailed");
  } finally {
    isProcessing.value = false;
  }
}
</script>

<i18n lang="yaml">
de:
  title: Notizbuch teilen
  description: Weise dieses Notizbuch einem Space zu, um es mit anderen zu teilen.
  pageTitle: Seite teilen
  pageDescription: Weise diese Seite einem Space zu, um sie mit anderen zu teilen.
  availableSpaces: Verfügbare Spaces
  noSpaces: Es sind keine Spaces vorhanden. Spaces können in den Vault-Einstellungen verwaltet werden.
  close: Schließen
  loadFailed: Daten konnten nicht geladen werden.
  shareFailed: Fehler beim Teilen des Notizbuchs.
  unshareFailed: Fehler beim Aufheben der Freigabe.
en:
  title: Share Notebook
  description: Assign this notebook to a space to share it with others.
  pageTitle: Share Page
  pageDescription: Assign this page to a space to share it with others.
  availableSpaces: Available Spaces
  noSpaces: No spaces available. Spaces can be managed in the vault settings.
  close: Close
  loadFailed: Failed to load data.
  shareFailed: Failed to share the notebook.
  unshareFailed: Failed to unshare the notebook.
</i18n>
