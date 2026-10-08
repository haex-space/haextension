<template>
  <button
    v-if="displaySyncStatus"
    class="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
    :class="{ 'cursor-pointer': hasErrors }"
    @click="hasErrors && emit('showErrors')"
  >
    <component
      :is="displaySyncStatus.icon"
      class="size-4"
      :class="displaySyncStatus.class"
    />
    {{ displaySyncStatus.text }}
  </button>
</template>

<script setup lang="ts">
import { CloudUpload, Check, RefreshCw, AlertCircle } from "@lucide/vue";

const emit = defineEmits<{
  showErrors: [];
}>();

const { t } = useI18n();
const filesStore = useFilesStore();

const hasErrors = computed(() => {
  const status = filesStore.syncStatus;
  return status && status.errors.length > 0;
});

// Sync status display object - derives from store's SyncStatus
const displaySyncStatus = computed(() => {
  const status = filesStore.syncStatus;
  if (!status) return null;

  // Determine display state based on SyncStatus from SDK
  if (status.isSyncing) {
    const parts: string[] = [];
    if (status.pendingUploads > 0) {
      parts.push(t("status.uploading", { count: status.pendingUploads }));
    }
    if (status.pendingDownloads > 0) {
      parts.push(t("status.downloading", { count: status.pendingDownloads }));
    }
    const text = parts.length > 0 ? parts.join(", ") : t("status.syncing");

    return {
      icon: RefreshCw,
      text,
      class: "text-primary animate-spin",
    };
  }
  if (status.errors.length > 0) {
    return {
      icon: AlertCircle,
      text: t("status.error", { count: status.errors.length }),
      class: "text-destructive",
    };
  }
  if (status.pendingUploads > 0 || status.pendingDownloads > 0) {
    const pending = status.pendingUploads + status.pendingDownloads;
    return {
      icon: CloudUpload,
      text: t("status.pending", { count: pending }),
      class: "text-warning",
    };
  }
  return {
    icon: Check,
    text: t("status.synced"),
    class: "text-success",
  };
});
</script>

<i18n lang="yaml">
de:
  status:
    synced: Synchronisiert
    syncing: Synchronisiere...
    uploading: "{count} hochladen"
    downloading: "{count} herunterladen"
    pending: "{count} ausstehend"
    error: "{count} Fehler"

en:
  status:
    synced: Synced
    syncing: Syncing...
    uploading: "{count} uploading"
    downloading: "{count} downloading"
    pending: "{count} pending"
    error: "{count} errors"
</i18n>
