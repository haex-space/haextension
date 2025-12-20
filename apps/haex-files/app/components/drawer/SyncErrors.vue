<template>
  <UiDrawerModal
    v-model:open="isOpen"
    :title="t('title')"
    :description="t('description')"
    content-class="sm:max-w-xl md:max-w-2xl"
  >
    <template #content>
      <div class="space-y-3 overflow-hidden px-1">
        <div v-if="errors.length === 0" class="text-center py-8 text-muted-foreground">
          {{ t("noErrors") }}
        </div>

        <!-- Selection header -->
        <div v-if="errors.length > 0" class="flex items-center gap-2 pb-2 border-b">
          <span class="text-sm text-muted-foreground flex-1">
            {{ selectedIds.size > 0 ? t("selectedCount", { count: selectedIds.size }) : t("clickToSelect") }}
          </span>
          <ShadcnButton
            v-if="selectedIds.size > 0"
            size="sm"
            variant="ghost"
            @click="selectedIds = new Set()"
          >
            <X class="size-4 mr-1" />
            {{ t("clearSelection") }}
          </ShadcnButton>
          <ShadcnButton
            v-else
            size="sm"
            variant="ghost"
            @click="onSelectAllClick"
          >
            <CheckSquare class="size-4 mr-1" />
            {{ t("selectAll") }}
          </ShadcnButton>
        </div>

        <div
          v-for="error in errors"
          :key="error.fileId"
          class="p-3 rounded-md border border-destructive/30 bg-destructive/5 overflow-hidden cursor-pointer select-none transition-all group"
          :class="{
            'ring-2 ring-primary bg-primary/10': selectedIds.has(error.fileId),
            'hover:bg-destructive/10': !selectedIds.has(error.fileId)
          }"
          @click="toggleSelect(error.fileId, !selectedIds.has(error.fileId))"
        >
          <div class="flex items-start gap-3">
            <AlertCircle class="size-5 text-destructive shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0 overflow-hidden">
              <div class="font-medium truncate">{{ error.fileName }}</div>
              <div class="relative">
                <div class="text-sm text-muted-foreground mt-1 break-all line-clamp-3 pr-8">{{ error.error }}</div>
                <ShadcnButton
                  size="icon-sm"
                  variant="ghost"
                  class="absolute top-1 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  :tooltip="copiedId === error.fileId ? t('copied') : t('copyError')"
                  @click.stop="copyErrorAsync(error)"
                >
                  <Check v-if="copiedId === error.fileId" class="size-4 text-success" />
                  <Clipboard v-else class="size-4" />
                </ShadcnButton>
              </div>
              <div class="text-xs text-muted-foreground mt-1">
                {{ formatTimestamp(error.timestamp) }}
              </div>

              <!-- Conflict Resolution Actions -->
              <div v-if="isConflict(error)" class="flex flex-wrap gap-2 mt-3" @click.stop>
                <ShadcnButton
                  size="sm"
                  variant="outline"
                  :loading="resolvingId === error.fileId"
                  @click="resolveAsync(error.fileId, 'local')"
                >
                  <Upload class="size-4 mr-1" />
                  {{ t("keepLocal") }}
                </ShadcnButton>
                <ShadcnButton
                  size="sm"
                  variant="outline"
                  :loading="resolvingId === error.fileId"
                  @click="resolveAsync(error.fileId, 'remote')"
                >
                  <Download class="size-4 mr-1" />
                  {{ t("keepRemote") }}
                </ShadcnButton>
                <ShadcnButton
                  size="sm"
                  variant="outline"
                  :loading="resolvingId === error.fileId"
                  @click="resolveAsync(error.fileId, 'keepBoth')"
                >
                  <Copy class="size-4 mr-1" />
                  {{ t("keepBoth") }}
                </ShadcnButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex gap-2 w-full sm:justify-end">
        <ShadcnButton variant="outline" @click="isOpen = false">
          {{ t("close") }}
        </ShadcnButton>

        <!-- Delete buttons -->
        <ShadcnButton
          v-if="selectedIds.size > 0"
          variant="destructive"
          :loading="isRemoving"
          @click="removeSelectedAsync"
        >
          <Trash2 class="size-4 mr-2" />
          {{ t("deleteSelected", { count: selectedIds.size }) }}
        </ShadcnButton>
        <ShadcnButton
          v-else-if="errors.length > 0"
          variant="destructive"
          :loading="isRemoving"
          @click="removeAllAsync"
        >
          <Trash2 class="size-4 mr-2" />
          {{ t("deleteAll") }}
        </ShadcnButton>

        <!-- Retry buttons -->
        <ShadcnButton
          v-if="selectedIds.size > 0"
          variant="default"
          :loading="isRetrying"
          @click="retrySelectedAsync"
        >
          <RefreshCw class="size-4 mr-2" />
          {{ t("retrySelected", { count: selectedIds.size }) }}
        </ShadcnButton>
        <ShadcnButton
          v-else-if="errors.length > 0"
          variant="default"
          :loading="isRetrying"
          @click="retryAllAsync"
        >
          <RefreshCw class="size-4 mr-2" />
          {{ t("retryAll") }}
        </ShadcnButton>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { AlertCircle, Upload, Download, Copy, RefreshCw, Trash2, X, CheckSquare, Clipboard, Check } from "lucide-vue-next";
import { useClipboard } from "@vueuse/core";
import type { SyncError } from "~/stores/files";

// Conflict resolution types (for future implementation)
type ConflictResolution = "local" | "remote" | "keepBoth";

const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const filesStore = useFilesStore();

const resolvingId = ref<string | null>(null);
const selectedIds = ref<Set<string>>(new Set());
const isRetrying = ref(false);
const isRemoving = ref(false);
const copiedId = ref<string | null>(null);

const errors = computed(() => {
  return filesStore.syncStatus?.errors ?? [];
});

const isConflict = (error: SyncError) => {
  return error.error.toLowerCase().includes("conflict");
};

const formatTimestamp = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
};

const toggleSelect = (fileId: string, checked: boolean) => {
  if (checked) {
    selectedIds.value.add(fileId);
  } else {
    selectedIds.value.delete(fileId);
  }
  // Trigger reactivity
  selectedIds.value = new Set(selectedIds.value);
};

const onSelectAllClick = () => {
  selectedIds.value = new Set(errors.value.map((e) => e.fileId));
};

const { copy } = useClipboard();

const copyErrorAsync = async (error: SyncError) => {
  const text = `${error.fileName}\n${error.error}\n${formatTimestamp(error.timestamp)}`;
  await copy(text);
  copiedId.value = error.fileId;
  setTimeout(() => {
    copiedId.value = null;
  }, 2000);
};

const resolveAsync = async (_fileId: string, _resolution: ConflictResolution) => {
  // TODO: Implement conflict resolution in the new architecture
  // For now, just show a message that this feature is coming soon
  console.warn("[SyncErrors] Conflict resolution not yet implemented in new architecture");
};

const retrySelectedAsync = async () => {
  if (selectedIds.value.size === 0) return;

  isRetrying.value = true;
  try {
    // Get queue entries for the selected error IDs and retry them
    await filesStore.loadQueueEntriesAsync();
    const entriesToRetry = filesStore.queueEntries.filter((e) => selectedIds.value.has(e.id));

    for (const entry of entriesToRetry) {
      await filesStore.removeQueueEntryAsync(entry.id);
    }

    // Re-add them to trigger re-sync
    await filesStore.retryFailedQueueAsync();

    selectedIds.value = new Set();
    isOpen.value = false;

    // Process the queue
    await filesStore.processQueueAsync();
  } catch (error) {
    console.error("[SyncErrors] Failed to retry selected:", error);
  } finally {
    isRetrying.value = false;
  }
};

const retryAllAsync = async () => {
  isRetrying.value = true;
  try {
    await filesStore.retryFailedQueueAsync();
    isOpen.value = false;
    await filesStore.processQueueAsync();
  } catch (error) {
    console.error("[SyncErrors] Failed to retry all:", error);
  } finally {
    isRetrying.value = false;
  }
};

const removeSelectedAsync = async () => {
  if (selectedIds.value.size === 0) return;

  isRemoving.value = true;
  try {
    for (const entryId of selectedIds.value) {
      await filesStore.removeQueueEntryAsync(entryId);
    }
    // Clear errors for removed entries
    filesStore.clearSyncErrors();
    selectedIds.value = new Set();
  } catch (error) {
    console.error("[SyncErrors] Failed to remove selected:", error);
  } finally {
    isRemoving.value = false;
  }
};

const removeAllAsync = async () => {
  if (errors.value.length === 0) return;

  isRemoving.value = true;
  try {
    for (const error of errors.value) {
      await filesStore.removeQueueEntryAsync(error.fileId);
    }
    filesStore.clearSyncErrors();
    selectedIds.value = new Set();
  } catch (error) {
    console.error("[SyncErrors] Failed to remove all:", error);
  } finally {
    isRemoving.value = false;
  }
};

// Reset selection when modal closes
watch(isOpen, (open) => {
  if (!open) {
    selectedIds.value = new Set();
  }
});
</script>

<i18n lang="yaml">
de:
  title: Sync-Fehler
  description: Hier werden Fehler angezeigt, die während der Synchronisierung aufgetreten sind.
  noErrors: Keine Fehler vorhanden
  keepLocal: Lokal behalten
  keepRemote: Remote behalten
  keepBoth: Beide behalten
  close: Schließen
  selectAll: Alle auswählen
  clearSelection: Auswahl aufheben
  clickToSelect: Klicken zum Auswählen
  selectedCount: "{count} ausgewählt"
  retrySelected: "{count} erneut versuchen"
  retryAll: Alle erneut versuchen
  deleteSelected: "{count} löschen"
  deleteAll: Alle löschen
  copyError: Fehler kopieren
  copied: Kopiert!

en:
  title: Sync Errors
  description: Errors that occurred during synchronization are shown here.
  noErrors: No errors
  keepLocal: Keep local
  keepRemote: Keep remote
  keepBoth: Keep both
  close: Close
  selectAll: Select all
  clearSelection: Clear selection
  clickToSelect: Click to select
  selectedCount: "{count} selected"
  retrySelected: "Retry {count}"
  retryAll: Retry all
  deleteSelected: "Delete {count}"
  deleteAll: Delete all
  copyError: Copy error
  copied: Copied!
</i18n>
