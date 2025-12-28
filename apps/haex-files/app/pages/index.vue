<template>
  <UiSidebarResizable
    v-model:mobile-open="isMobileSidebarOpen"
    panel-group-id="haex-files-panels"
    auto-save-id="haex-files:sidebar-panel-sizes"
    :default-sidebar-size="20"
    :min-sidebar-size="15"
    :max-sidebar-size="40"
  >
    <!-- Header -->
    <template #header>
      <!-- Sync Rule Drawer -->
      <DrawerSyncRule
        v-if="showSyncRuleDrawer"
        :key="editingSyncRule?.id ?? 'add'"
        v-model:open="showSyncRuleDrawer"
        :edit-rule="editingSyncRule"
        @created="onSyncRuleCreated"
        @deleted="onSyncRuleDeleted"
      />

      <!-- Sync Errors Drawer -->
      <DrawerSyncErrors v-model:open="showErrorsDrawer" />

      <header
        class="flex-none border-b border-border px-4 py-3 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <ShadcnButton
            variant="ghost"
            size="icon-sm"
            class="md:hidden"
            @click="isMobileSidebarOpen = true"
          >
            <Menu class="size-5" />
          </ShadcnButton>
          <FolderSync class="size-6 text-primary" />
          <h1 class="text-lg font-semibold">{{ t("title") }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <!-- Sync Status -->
          <button
            v-if="displaySyncStatus"
            class="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
            :class="{ 'cursor-pointer': hasErrors }"
            @click="hasErrors && (showErrorsDrawer = true)"
          >
            <component
              :is="displaySyncStatus.icon"
              class="size-4"
              :class="displaySyncStatus.class"
            />
            {{ displaySyncStatus.text }}
          </button>

          <!-- Sync Button -->
          <ShadcnButton
            v-if="isInitialized && currentRule"
            variant="outline"
            size="icon"
            :tooltip="t('triggerSync')"
            :disabled="filesStore.isSyncing"
            @click="triggerSync"
          >
            <RefreshCw
              class="size-5"
              :class="{ 'animate-spin': filesStore.isSyncing }"
            />
          </ShadcnButton>

          <!-- Settings -->
          <ShadcnButton
            variant="ghost"
            size="icon"
            :tooltip="t('settings')"
            @click="router.push('/settings')"
          >
            <Settings class="size-5" />
          </ShadcnButton>
        </div>
      </header>
    </template>

    <!-- Sidebar -->
    <template #sidebar>
      <div
        class="flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
      >
        <!-- Sync Rules Section -->
        <div class="border-b border-sidebar-border p-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">
              {{ t("syncedFolders") }}
            </h3>
            <ShadcnButton
              variant="default"
              size="icon-sm"
              :tooltip="t('addSyncRule')"
              @click="openAddSyncRule"
            >
              <Plus class="size-4" />
            </ShadcnButton>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-2">
          <!-- Sync Rules -->
          <ShadcnSidebarMenu>
            <ShadcnSidebarMenuItem v-for="rule in syncRules" :key="rule.id">
              <ShadcnSidebarMenuButtonChild
                size="lg"
                :is-active="currentRuleId === rule.id"
                class="cursor-pointer"
                @click="selectRule(rule.id)"
              >
                <FolderSync />
                <span>{{ getFolderName(rule.localPath) }}</span>
              </ShadcnSidebarMenuButtonChild>
              <ShadcnSidebarMenuAction
                show-on-hover
                :title="t('editSyncRule')"
                class="cursor-pointer"
                @click="openEditSyncRule(rule.id)"
              >
                <Pencil />
              </ShadcnSidebarMenuAction>
            </ShadcnSidebarMenuItem>
            <p
              v-if="syncRules.length === 0"
              class="px-3 py-2 text-sm text-muted-foreground italic"
            >
              {{ t("noSyncRules") }}
            </p>
          </ShadcnSidebarMenu>

        </div>
      </div>
    </template>

    <!-- Content -->
    <template #content>
      <div class="h-full p-4">
        <div
          v-if="!isInitialized"
          class="h-full flex items-center justify-center"
        >
          <div class="text-center">
            <FolderSync class="size-12 text-muted-foreground mx-auto mb-4" />
            <h2 class="text-xl font-semibold mb-2">{{ t("welcome.title") }}</h2>
            <p class="text-muted-foreground mb-4">
              {{ t("welcome.description") }}
            </p>
            <button
              class="px-4 py-2 bg-primary text-primary-foreground rounded-md"
              @click="setupSync"
            >
              {{ t("welcome.setup") }}
            </button>
          </div>
        </div>

        <div v-else class="space-y-4">
          <!-- Breadcrumb / Selection Toolbar Container -->
          <div class="relative h-[46px]">
            <!-- Breadcrumb -->
            <div class="absolute inset-0 flex items-center gap-1 text-sm text-muted-foreground px-4">
              <button class="hover:text-foreground" @click="navigateToRoot">
                {{ currentRuleFolderName || t("files") }}
              </button>
              <template v-for="(segment, index) in pathSegments" :key="index">
                <ChevronRight class="size-4" />
                <button
                  class="hover:text-foreground"
                  @click="navigateToPath(index)"
                >
                  {{ segment }}
                </button>
              </template>
            </div>

            <!-- Selection Toolbar (overlays breadcrumbs when in selection mode) -->
            <FileSelectionToolbar
              class="absolute inset-0"
              :all-selected-are-ignored="allSelectedAreIgnored"
              @select-all="selectAllFiles"
              @add-to-ignore="addSelectedToIgnoreAsync"
              @remove-from-ignore="removeSelectedFromIgnoreAsync"
            />
          </div>

          <!-- File List -->
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
        </div>
      </div>
    </template>
  </UiSidebarResizable>
</template>

<script setup lang="ts">
import {
  FolderSync,
  Folder,
  CloudUpload,
  ChevronRight,
  File as FileIcon,
  Check,
  RefreshCw,
  AlertCircle,
  Settings,
  Plus,
  Pencil,
  Menu,
  Upload,
  EyeOff,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-vue-next";
import type { SyncRule } from "~/stores/syncRules";
import { QUEUE_STATUS, isPathIgnored, type LocalFileInfo } from "~/stores/files";
import { onLongPress } from "@vueuse/core";

const { t } = useI18n();
const router = useRouter();
const backendsStore = useBackendsStore();
const spacesStore = useSpacesStore();
const syncRulesStore = useSyncRulesStore();
const filesStore = useFilesStore();
const selectionStore = useFileSelectionStore();

const { syncRules } = storeToRefs(syncRulesStore);
const { sortedFiles: files, pathSegments } = storeToRefs(filesStore);

// State
const isInitialized = ref(false);
const currentRuleId = ref<string | null>(null);
const showSyncRuleDrawer = ref(false);
const showErrorsDrawer = ref(false);
const editingSyncRule = ref<SyncRule | null>(null);
const isMobileSidebarOpen = ref(false);
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
      selectionStore.toggleSelection(file.relativePath);
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

// Check if all selected files are ignored
const allSelectedAreIgnored = computed(() => {
  if (selectionStore.selectedCount === 0 || !currentRule.value) return false;
  return Array.from(selectionStore.selectedFiles).every((path) =>
    isPathIgnored(path, currentRule.value!.ignorePatterns)
  );
});

// Select all non-directory files
const selectAllFiles = () => {
  const filePaths = files.value
    .filter((f) => !f.isDirectory)
    .map((f) => f.relativePath);
  selectionStore.selectAll(filePaths);
};

// Add selected files to ignore list
const addSelectedToIgnoreAsync = async () => {
  if (!currentRule.value) return;

  const selectedPaths = Array.from(selectionStore.selectedFiles);
  const currentPatterns = currentRule.value.ignorePatterns || [];

  // Add paths that aren't already ignored
  const newPatterns = selectedPaths.filter(
    (path) => !isPathIgnored(path, currentPatterns)
  );

  if (newPatterns.length === 0) return;

  const updatedPatterns = [...currentPatterns, ...newPatterns];

  await syncRulesStore.updateSyncRuleAsync({
    ruleId: currentRule.value.id,
    ignorePatterns: updatedPatterns,
  });

  selectionStore.clearSelection();
};

// Remove selected files from ignore list
const removeSelectedFromIgnoreAsync = async () => {
  if (!currentRule.value) return;

  const selectedPaths = new Set(selectionStore.selectedFiles);
  const currentPatterns = currentRule.value.ignorePatterns || [];

  // Remove exact matches from patterns
  const updatedPatterns = currentPatterns.filter(
    (pattern) => !selectedPaths.has(pattern.trim())
  );

  await syncRulesStore.updateSyncRuleAsync({
    ruleId: currentRule.value.id,
    ignorePatterns: updatedPatterns,
  });

  selectionStore.clearSelection();
};

// Sync status polling
const POLL_INTERVAL_SYNCING = 1000; // 1 second when syncing
const POLL_INTERVAL_IDLE = 30000; // 30 seconds when idle
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

const startSyncStatusPolling = () => {
  stopSyncStatusPolling();

  const poll = async () => {
    await filesStore.loadSyncStatusAsync();
    // Also reload queue entries to update file status badges and error list
    if (currentRuleId.value) {
      await filesStore.loadQueueEntriesAsync(currentRuleId.value);
    }

    // Adjust polling interval based on sync state
    const currentInterval = filesStore.isSyncing
      ? POLL_INTERVAL_SYNCING
      : POLL_INTERVAL_IDLE;

    // Restart with new interval if needed
    if (pollIntervalId) {
      stopSyncStatusPolling();
      pollIntervalId = setInterval(poll, currentInterval);
    }
  };

  // Start with syncing interval, will adjust automatically
  pollIntervalId = setInterval(poll, POLL_INTERVAL_SYNCING);
};

const stopSyncStatusPolling = () => {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
};

// Computed
const currentRule = computed(() =>
  syncRules.value.find((r) => r.id === currentRuleId.value)
);

const currentRuleFolderName = computed(() => {
  if (!currentRule.value) return null;
  return getFolderName(currentRule.value.localPath);
});

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

// Methods
const getFolderName = (path: string): string => {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] || path;
};

/**
 * Check if a file is ignored by the current sync rule's ignore patterns
 */
const isFileIgnored = (relativePath: string): boolean => {
  if (!currentRule.value) return false;
  return isPathIgnored(relativePath, currentRule.value.ignorePatterns);
};

const selectRule = (ruleId: string) => {
  currentRuleId.value = ruleId;
  isMobileSidebarOpen.value = false;
};

const openAddSyncRule = () => {
  editingSyncRule.value = null;
  showSyncRuleDrawer.value = true;
};

const openEditSyncRule = (ruleId: string) => {
  const rule = syncRules.value.find((r) => r.id === ruleId);
  if (rule) {
    editingSyncRule.value = rule;
    showSyncRuleDrawer.value = true;
  }
};

const setupSync = () => {
  openAddSyncRule();
};

const onSyncRuleCreated = async (ruleId: string) => {
  console.log(`[haex-files] Sync rule created: ${ruleId}`);
  isInitialized.value = true;
  currentRuleId.value = ruleId;

  // Auto-trigger sync after creating a new rule
  try {
    await filesStore.triggerSyncAsync(ruleId);
  } catch (error) {
    console.error("[haex-files] Auto-sync after rule creation failed:", error);
  }
};

const onSyncRuleDeleted = (ruleId: string) => {
  console.log(`[haex-files] Sync rule deleted: ${ruleId}`);
  if (currentRuleId.value === ruleId) {
    const remainingRules = syncRules.value.filter((r) => r.id !== ruleId);
    const firstRemaining = remainingRules[0];
    if (firstRemaining) {
      currentRuleId.value = firstRemaining.id;
    } else {
      currentRuleId.value = null;
      isInitialized.value = false;
    }
  }
};

const triggerSync = async () => {
  if (!currentRuleId.value) return;
  try {
    await filesStore.triggerSyncAsync(currentRuleId.value);
  } catch (error) {
    console.error("[haex-files] Sync failed:", error);
  }
};

const uploadFileAsync = async (file: (typeof files.value)[0]) => {
  if (!currentRule.value) return;

  uploadingFileId.value = file.relativePath;
  try {
    // Add the single file to the queue and process
    for (const backendId of currentRule.value.backendIds) {
      await filesStore.addFilesToQueueAsync(
        currentRule.value.id,
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

const navigateToRoot = async () => {
  await filesStore.navigateToRoot();
};

const navigateToPath = async (index: number) => {
  const segments = pathSegments.value.slice(0, index + 1);
  const path = segments.join("/");
  await filesStore.navigateToPath(path);
};

const onFileClick = async (file: (typeof files.value)[0], event: MouseEvent) => {
  // Ctrl/Cmd click toggles selection
  if (event.ctrlKey || event.metaKey) {
    if (!file.isDirectory) {
      selectionStore.toggleSelection(file.relativePath);
    }
    return;
  }

  // If in selection mode and clicking a file, toggle selection
  if (selectionStore.isSelectionMode && !file.isDirectory) {
    selectionStore.toggleSelection(file.relativePath);
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

// Watch for rule changes to load files and queue entries
watch(currentRuleId, async (newRuleId) => {
  // Clear selection when rule changes
  selectionStore.clearSelection();

  if (newRuleId) {
    await Promise.all([
      filesStore.loadFilesAsync(newRuleId, ""),
      filesStore.loadQueueEntriesAsync(newRuleId),
    ]);
  } else {
    filesStore.clear();
  }
});

// Clear selection when path changes
watch(() => filesStore.currentPath, () => {
  selectionStore.clearSelection();
});

// Load data on mount
onMounted(async () => {
  // Initialize HaexVault store first (runs migrations, initializes ORM)
  const haexVaultStore = useHaexVaultStore();
  await haexVaultStore.initializeAsync();

  await Promise.all([
    backendsStore.loadBackendsAsync(),
    spacesStore.loadSpacesAsync(),
    syncRulesStore.loadSyncRulesAsync(),
    filesStore.loadSyncStatusAsync(),
  ]);

  if (syncRulesStore.syncRules.length > 0) {
    isInitialized.value = true;
    const firstRule = syncRulesStore.syncRules[0];
    if (firstRule) {
      currentRuleId.value = firstRule.id;
      // Load queue entries for the first rule to show correct status
      await filesStore.loadQueueEntriesAsync(firstRule.id);
    }

    // Start auto-sync watcher (native file watcher + fallback polling every 5 min)
    filesStore.startWatcher();
  }

  // Start sync status polling
  startSyncStatusPolling();
});

onUnmounted(() => {
  stopSyncStatusPolling();
  filesStore.stopWatcher();
});
</script>

<i18n lang="yaml">
de:
  title: haex-files
  files: Dateien
  folder: Ordner
  syncedFolders: Synchronisierte Ordner
  addSyncRule: Ordner hinzufügen
  editSyncRule: Sync-Regel bearbeiten
  noSyncRules: Keine Ordner synchronisiert
  settings: Einstellungen
  triggerSync: Synchronisierung starten
  emptyFolder: Dieser Ordner ist leer
  uploadFile: Datei hochladen
  ignored: Ignoriert
  ignoredHint: Diese Datei wird nicht synchronisiert
  welcome:
    title: Willkommen bei haex-files
    description: Synchronisiere deine Dateien sicher und verschlüsselt zwischen deinen Geräten.
    setup: Sync einrichten
  status:
    synced: Synchronisiert
    syncing: Synchronisiere...
    uploading: "{count} hochladen"
    downloading: "{count} herunterladen"
    pending: "{count} ausstehend"
    error: "{count} Fehler"
  fileStatus:
    pending: Ausstehend
    uploading: Wird hochgeladen
    synced: Synchronisiert
    failed: Fehlgeschlagen

en:
  title: haex-files
  files: Files
  folder: Folder
  syncedFolders: Synced Folders
  addSyncRule: Add folder
  editSyncRule: Edit sync rule
  noSyncRules: No folders synced
  settings: Settings
  triggerSync: Start sync
  emptyFolder: This folder is empty
  uploadFile: Upload file
  ignored: Ignored
  ignoredHint: This file will not be synced
  welcome:
    title: Welcome to haex-files
    description: Sync your files securely and encrypted between your devices.
    setup: Setup Sync
  status:
    synced: Synced
    syncing: Syncing...
    uploading: "{count} uploading"
    downloading: "{count} downloading"
    pending: "{count} pending"
    error: "{count} errors"
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
