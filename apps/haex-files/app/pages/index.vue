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

      <header class="flex-none border-b border-border px-4 py-3 flex items-center justify-between">
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
          <span
            v-if="displaySyncStatus"
            class="text-sm text-muted-foreground flex items-center gap-1"
          >
            <component
              :is="displaySyncStatus.icon"
              class="size-4"
              :class="displaySyncStatus.class"
            />
            {{ displaySyncStatus.text }}
          </span>

          <!-- Sync Button -->
          <ShadcnButton
            v-if="isInitialized && currentRule"
            variant="outline"
            size="icon"
            :tooltip="t('triggerSync')"
            :disabled="filesStore.isSyncing"
            @click="triggerSync"
          >
            <RefreshCw class="size-5" :class="{ 'animate-spin': filesStore.isSyncing }" />
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
      <div class="flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
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
            <p v-if="syncRules.length === 0" class="px-3 py-2 text-sm text-muted-foreground italic">
              {{ t("noSyncRules") }}
            </p>
          </ShadcnSidebarMenu>

          <!-- Backends Section -->
          <div class="mt-4">
            <h4 class="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {{ t("backends") }}
            </h4>
            <div class="space-y-1">
              <div
                v-for="backend in backends"
                :key="backend.id"
                class="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <Cloud class="size-4 shrink-0" />
                <span class="truncate flex-1">{{ backend.name }}</span>
                <span
                  class="size-2 rounded-full shrink-0"
                  :class="backend.enabled ? 'bg-success' : 'bg-muted'"
                />
              </div>
              <p v-if="backends.length === 0" class="px-2 py-1 text-sm text-muted-foreground italic">
                {{ t("noBackends") }}
              </p>
            </div>
          </div>
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
          <!-- Breadcrumb -->
          <div class="flex items-center gap-1 text-sm text-muted-foreground">
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

          <!-- File List -->
          <div class="grid gap-2">
            <div
              v-for="file in files"
              :key="file.id"
              class="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-accent cursor-pointer"
              @click="onFileClick(file)"
            >
              <component
                :is="file.isDirectory ? Folder : FileIcon"
                class="size-5 text-muted-foreground"
              />
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ file.name }}</div>
                <div class="text-sm text-muted-foreground">
                  {{ file.isDirectory ? t("folder") : formatSize(file.size) }}
                </div>
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
  Cloud,
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
} from "lucide-vue-next";
import type { SyncRule } from "@haex-space/vault-sdk";

const { t } = useI18n();
const router = useRouter();
const backendsStore = useBackendsStore();
const spacesStore = useSpacesStore();
const syncRulesStore = useSyncRulesStore();
const filesStore = useFilesStore();

const { backends } = storeToRefs(backendsStore);
const { syncRules } = storeToRefs(syncRulesStore);
const { sortedFiles: files, pathSegments } = storeToRefs(filesStore);

// State
const isInitialized = ref(false);
const currentRuleId = ref<string | null>(null);
const showSyncRuleDrawer = ref(false);
const editingSyncRule = ref<SyncRule | null>(null);
const isMobileSidebarOpen = ref(false);

// Computed
const currentRule = computed(() =>
  syncRules.value.find((r) => r.id === currentRuleId.value)
);

const currentRuleFolderName = computed(() => {
  if (!currentRule.value) return null;
  return getFolderName(currentRule.value.localPath);
});

// Sync status display object - derives from store's SyncStatus
const displaySyncStatus = computed(() => {
  const status = filesStore.syncStatus;
  if (!status) return null;

  // Determine display state based on SyncStatus from SDK
  if (status.isSyncing) {
    return {
      icon: RefreshCw,
      text: t("status.syncing"),
      class: "text-primary animate-spin",
    };
  }
  if (status.errors.length > 0) {
    return {
      icon: AlertCircle,
      text: t("status.error"),
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
  await filesStore.loadSyncStatusAsync();
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
  try {
    await filesStore.triggerSyncAsync();
  } catch (error) {
    console.error("[haex-files] Sync failed:", error);
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

const onFileClick = async (file: (typeof files.value)[0]) => {
  if (file.isDirectory) {
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

// Watch for rule changes to load files
watch(currentRuleId, async (newRuleId) => {
  if (newRuleId) {
    await filesStore.loadFilesAsync(newRuleId, "");
  } else {
    filesStore.clear();
  }
});

// Load data on mount
onMounted(async () => {
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
    }
  }
});
</script>

<i18n lang="yaml">
de:
  title: haex-files
  files: Dateien
  folder: Ordner
  backends: Speicher
  noBackends: Keine Speicher konfiguriert
  syncedFolders: Synchronisierte Ordner
  addSyncRule: Ordner hinzufügen
  editSyncRule: Sync-Regel bearbeiten
  noSyncRules: Keine Ordner synchronisiert
  settings: Einstellungen
  triggerSync: Synchronisierung starten
  emptyFolder: Dieser Ordner ist leer
  welcome:
    title: Willkommen bei haex-files
    description: Synchronisiere deine Dateien sicher und verschlüsselt zwischen deinen Geräten.
    setup: Sync einrichten
  status:
    synced: Synchronisiert
    syncing: Synchronisiere...
    pending: "{count} ausstehend"
    error: Sync-Fehler

en:
  title: haex-files
  files: Files
  folder: Folder
  backends: Storage
  noBackends: No storage configured
  syncedFolders: Synced Folders
  addSyncRule: Add folder
  editSyncRule: Edit sync rule
  noSyncRules: No folders synced
  settings: Settings
  triggerSync: Start sync
  emptyFolder: This folder is empty
  welcome:
    title: Welcome to haex-files
    description: Sync your files securely and encrypted between your devices.
    setup: Setup Sync
  status:
    synced: Synced
    syncing: Syncing...
    pending: "{count} pending"
    error: Sync Error
</i18n>
