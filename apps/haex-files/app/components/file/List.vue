<template>
  <div class="grid gap-2">
    <div
      v-for="file in files"
      :ref="(el) => setupLongPress(el, file)"
      :key="file.path"
      class="relative flex items-center gap-3 p-3 rounded-md border border-border hover:bg-accent cursor-pointer group overflow-hidden select-none"
      :class="{
        'opacity-50': isFileIgnored(file.relativePath),
        'border-primary/50': getFileSyncStatus(file.relativePath)?.status === QUEUE_STATUS.IN_PROGRESS,
        'bg-primary/10 border-primary': selectionStore.isSelected(file.relativePath),
      }"
      @click="onFileClick(file, $event)"
    >
      <!-- Upload Progress Background -->
      <div
        v-if="getFileSyncStatus(file.relativePath)?.status === QUEUE_STATUS.IN_PROGRESS"
        class="absolute inset-0 upload-progress-animation"
      />
      <!-- File/Folder icon -->
      <component
        :is="file.isDirectory ? Folder : FileIcon"
        class="relative z-10 size-5 text-muted-foreground shrink-0"
      />
      <div class="relative z-10 flex-1 min-w-0">
        <div class="font-medium truncate flex items-center gap-2">
          {{ file.name }}
          <!-- Ignored Badge -->
          <span
            v-if="isFileIgnored(file.relativePath)"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground"
            :title="t('ignoredHint')"
          >
            <EyeOff class="size-3" />
            {{ t("ignored") }}
          </span>
          <!-- Sync Status Badge -->
          <span
            v-else-if="getFileSyncStatus(file.relativePath)"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-muted"
            :title="getFileSyncStatus(file.relativePath)?.label"
          >
            <component
              :is="getFileSyncStatus(file.relativePath)?.icon"
              class="size-3"
              :class="getFileSyncStatus(file.relativePath)?.class"
            />
            {{ getFileSyncStatus(file.relativePath)?.label }}
          </span>
        </div>
        <div class="text-sm text-muted-foreground">
          {{ file.isDirectory ? t("folder") : formatSize(file.size) }}
        </div>
      </div>
      <!-- File Actions -->
      <div
        v-if="!file.isDirectory && !isFileIgnored(file.relativePath)"
        class="relative z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        @click.stop
      >
        <ShadcnButton
          variant="ghost"
          size="icon-sm"
          :tooltip="t('uploadFile')"
          :loading="uploadingFileId === file.relativePath"
          @click="uploadFileAsync(file)"
        >
          <Upload class="size-4" />
        </ShadcnButton>
      </div>
    </div>

    <div
      v-if="files.length === 0"
      class="text-center py-12 text-muted-foreground"
    >
      {{ t("emptyFolder") }}
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Folder,
  File as FileIcon,
  Upload,
  EyeOff,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
} from "@lucide/vue";
import type { SyncRule } from "~/stores/syncRules";
import { QUEUE_STATUS, type LocalFileInfo } from "~/stores/files/types";
import { isPathIgnored } from "~/stores/files/helpers";
import { onLongPress } from "@vueuse/core";

const props = defineProps<{
  files: LocalFileInfo[];
  currentRule?: SyncRule;
}>();

const { t } = useI18n();
const filesStore = useFilesStore();
const selectionStore = useFileSelectionStore();

const uploadingFileId = ref<string | null>(null);

// Long press functionality
const longPressedHook = ref(false);

const setupLongPress = (el: Element | ComponentPublicInstance | null, file: LocalFileInfo) => {
  if (!el || file.isDirectory) return;

  const element = el as HTMLElement;
  onLongPress(
    element,
    () => {
      longPressedHook.value = true;
      selectionStore.selectFile(file.relativePath);
    },
    { delay: 500 }
  );
};

// Auto-reset longPressedHook when selection is cleared
watch(
  () => selectionStore.selectedCount,
  (count) => {
    if (count === 0) {
      longPressedHook.value = false;
    }
  }
);

/**
 * Check if a file is ignored by the current sync rule's ignore patterns
 */
const isFileIgnored = (relativePath: string): boolean => {
  if (!props.currentRule) return false;
  return isPathIgnored(relativePath, props.currentRule.ignorePatterns);
};

const uploadFileAsync = async (file: LocalFileInfo) => {
  if (!props.currentRule) return;

  uploadingFileId.value = file.relativePath;
  try {
    // Add the single file to the queue and process
    for (const backendId of props.currentRule.backendIds) {
      await filesStore.addFilesToQueueAsync(
        props.currentRule.id,
        backendId,
        [{ localPath: file.path, relativePath: file.relativePath, fileSize: file.size }]
      );
    }
    await filesStore.processQueueAsync();
    // Reload sync status after upload
    await filesStore.loadSyncStatusAsync();
  } catch (error) {
    console.error("[haex-files] Upload failed:", error);
  } finally {
    uploadingFileId.value = null;
  }
};

const onFileClick = async (file: LocalFileInfo, event: MouseEvent) => {
  // If long press just happened and item is selected, ignore the click event that follows
  if (longPressedHook.value && selectionStore.isSelected(file.relativePath)) {
    event.preventDefault();
    longPressedHook.value = false;
    return;
  }

  // Ctrl/Cmd click toggles selection
  if (event.ctrlKey || event.metaKey) {
    if (!file.isDirectory) {
      selectionStore.toggleSelection(file.relativePath);
    }
    longPressedHook.value = false;
    return;
  }

  // If in selection mode and clicking a file, toggle selection
  if (selectionStore.isSelectionMode && !file.isDirectory) {
    selectionStore.toggleSelection(file.relativePath);
    longPressedHook.value = false;
    return;
  }

  if (file.isDirectory) {
    // Clear selection when navigating
    selectionStore.clearSelection();
    const currentPath = filesStore.currentPath || "";
    const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
    await filesStore.navigateToPath(newPath);
  } else {
    // TODO: Open file
  }
};

const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Get the sync status display config for a file
 */
const getFileSyncStatus = (relativePath: string) => {
  const status = filesStore.getFileQueueStatus(relativePath);
  if (!status) return null;

  switch (status) {
    case QUEUE_STATUS.PENDING:
      return {
        status,
        icon: Clock,
        class: "text-warning",
        label: t("fileStatus.pending"),
      };
    case QUEUE_STATUS.IN_PROGRESS:
      return {
        status,
        icon: Loader2,
        class: "text-primary animate-spin",
        label: t("fileStatus.uploading"),
      };
    case QUEUE_STATUS.COMPLETED:
      return {
        status,
        icon: CheckCircle2,
        class: "text-success",
        label: t("fileStatus.synced"),
      };
    case QUEUE_STATUS.FAILED:
      return {
        status,
        icon: XCircle,
        class: "text-destructive",
        label: t("fileStatus.failed"),
      };
    default:
      return null;
  }
};
</script>

<i18n lang="yaml">
de:
  folder: Ordner
  emptyFolder: Dieser Ordner ist leer
  uploadFile: Datei hochladen
  ignored: Ignoriert
  ignoredHint: Diese Datei wird nicht synchronisiert
  fileStatus:
    pending: Ausstehend
    uploading: Wird hochgeladen
    synced: Synchronisiert
    failed: Fehlgeschlagen

en:
  folder: Folder
  emptyFolder: This folder is empty
  uploadFile: Upload file
  ignored: Ignored
  ignoredHint: This file will not be synced
  fileStatus:
    pending: Pending
    uploading: Uploading
    synced: Synced
    failed: Failed
</i18n>

<style scoped>
.upload-progress-animation {
  background: linear-gradient(
    90deg,
    hsl(var(--primary) / 0.15) 0%,
    hsl(var(--primary) / 0.25) 50%,
    hsl(var(--primary) / 0.15) 100%
  );
  background-size: 200% 100%;
  animation: upload-shimmer 1.5s ease-in-out infinite;
}

@keyframes upload-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
