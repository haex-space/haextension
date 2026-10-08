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

      <!-- Backend Drawer -->
      <DrawerBackend v-model:open="showBackendDrawer" />

      <!-- Permission Drawer -->
      <DrawerPermission />

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
          <img :src="haexFilesLogo" alt="haex-files" class="size-6" />
          <h1 class="text-lg font-semibold">{{ t("title") }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <!-- Sync Status -->
          <SyncStatusButton @show-errors="showErrorsDrawer = true" />

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
            <img :src="haexFilesLogo" alt="haex-files" class="size-16 mx-auto mb-4" />
            <h2 class="text-xl font-semibold mb-2">{{ t("welcome.title") }}</h2>
            <p class="text-muted-foreground mb-4">
              {{ t("welcome.description") }}
            </p>
            <UiButton
              v-if="backends.length === 0"
              :prepend-icon="Plus"
              @click="openAddBackendDrawer"
            >
              {{ t("welcome.addBackend") }}
            </UiButton>
            <UiButton
              v-else
              @click="setupSync"
            >
              {{ t("welcome.setup") }}
            </UiButton>
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
          <FileList :files="files" :current-rule="currentRule" />
        </div>
      </div>
    </template>
  </UiSidebarResizable>
</template>

<script setup lang="ts">
import {
  FolderSync,
  ChevronRight,
  RefreshCw,
  Settings,
  Plus,
  Pencil,
  Menu,
} from "@lucide/vue";
import haexFilesLogo from "~/assets/haex-files-logo.png";
import type { SyncRule } from "~/stores/syncRules";
import { isPathIgnored } from "~/stores/files/helpers";

const { t } = useI18n();
const router = useRouter();
const backendsStore = useBackendsStore();
const spacesStore = useSpacesStore();
const syncRulesStore = useSyncRulesStore();
const filesStore = useFilesStore();
const selectionStore = useFileSelectionStore();

const { syncRules } = storeToRefs(syncRulesStore);
const { sortedFiles: files, pathSegments } = storeToRefs(filesStore);
const { backends } = storeToRefs(backendsStore);

// State
const isInitialized = ref(false);
const currentRuleId = ref<string | null>(null);
const showSyncRuleDrawer = ref(false);
const showErrorsDrawer = ref(false);
const editingSyncRule = ref<SyncRule | null>(null);
const isMobileSidebarOpen = ref(false);
const showBackendDrawer = ref(false);

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

const { startSyncStatusPolling, stopSyncStatusPolling } = useSyncStatusPolling(currentRuleId);

// Computed
const currentRule = computed(() =>
  syncRules.value.find((r) => r.id === currentRuleId.value)
);

const currentRuleFolderName = computed(() => {
  if (!currentRule.value) return null;
  return getFolderName(currentRule.value.localPath);
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

const openAddBackendDrawer = () => {
  showBackendDrawer.value = true;
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

const navigateToRoot = async () => {
  await filesStore.navigateToRoot();
};

const navigateToPath = async (index: number) => {
  const segments = pathSegments.value.slice(0, index + 1);
  const path = segments.join("/");
  await filesStore.navigateToPath(path);
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
  syncedFolders: Synchronisierte Ordner
  addSyncRule: Ordner hinzufügen
  editSyncRule: Sync-Regel bearbeiten
  noSyncRules: Keine Ordner synchronisiert
  settings: Einstellungen
  triggerSync: Synchronisierung starten
  welcome:
    title: Willkommen bei haex-files
    description: Synchronisiere deine Dateien sicher und verschlüsselt zwischen deinen Geräten.
    setup: Sync einrichten
    addBackend: Backend hinzufügen

en:
  title: haex-files
  files: Files
  syncedFolders: Synced Folders
  addSyncRule: Add folder
  editSyncRule: Edit sync rule
  noSyncRules: No folders synced
  settings: Settings
  triggerSync: Start sync
  welcome:
    title: Welcome to haex-files
    description: Sync your files securely and encrypted between your devices.
    setup: Setup Sync
    addBackend: Add Backend
</i18n>
