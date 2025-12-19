<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')" :description="t('description')">
    <template #content>
      <div class="space-y-3">
        <div v-if="errors.length === 0" class="text-center py-8 text-muted-foreground">
          {{ t("noErrors") }}
        </div>

        <div
          v-for="error in errors"
          :key="error.fileId"
          class="p-3 rounded-md border border-destructive/30 bg-destructive/5"
        >
          <div class="flex items-start gap-3">
            <AlertCircle class="size-5 text-destructive shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ error.fileName }}</div>
              <div class="text-sm text-muted-foreground mt-1">{{ error.error }}</div>
              <div class="text-xs text-muted-foreground mt-1">
                {{ formatTimestamp(error.timestamp) }}
              </div>

              <!-- Conflict Resolution Actions -->
              <div v-if="isConflict(error)" class="flex gap-2 mt-3">
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
        <ShadcnButton
          v-if="errors.length > 0"
          variant="default"
          @click="retrySync"
        >
          <RefreshCw class="size-4 mr-2" />
          {{ t("retrySync") }}
        </ShadcnButton>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { AlertCircle, Upload, Download, Copy, RefreshCw } from "lucide-vue-next";
import type { ConflictResolution } from "~/stores/files";

const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const filesStore = useFilesStore();

const resolvingId = ref<string | null>(null);

const errors = computed(() => {
  return filesStore.syncStatus?.errors ?? [];
});

const isConflict = (error: { error: string }) => {
  return error.error.toLowerCase().includes("conflict");
};

const formatTimestamp = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
};

const resolveAsync = async (fileId: string, resolution: ConflictResolution) => {
  resolvingId.value = fileId;
  try {
    await filesStore.resolveConflictAsync(fileId, resolution);
  } catch (error) {
    console.error("[SyncErrors] Failed to resolve conflict:", error);
  } finally {
    resolvingId.value = null;
  }
};

const retrySync = async () => {
  isOpen.value = false;
  await filesStore.triggerSyncAsync();
};
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
  retrySync: Erneut synchronisieren

en:
  title: Sync Errors
  description: Errors that occurred during synchronization are shown here.
  noErrors: No errors
  keepLocal: Keep local
  keepRemote: Keep remote
  keepBoth: Keep both
  close: Close
  retrySync: Retry sync
</i18n>
