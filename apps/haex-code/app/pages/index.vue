<script setup lang="ts">
import { GripHorizontal } from "@lucide/vue";
import type { FileEntry, EditorTab } from "~/types";

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const workspace = useWorkspaceStore();
const editorStore = useEditorStore();
const terminalStore = useTerminalStore();
const settings = useSettingsStore();
const gitStore = useGitStore();
const { detectLanguage } = useLanguageDetection();
const { shells, detectShells } = useAvailableShells();
const isMobile = useIsMobile();

const sidebarVisible = ref(true);
const terminalVisible = ref(true);
const settingsVisible = ref(false);
const sidebarTab = ref<"explorer" | "git">("explorer");

watch(sidebarTab, (tab) => {
  if (tab === "git" && workspace.rootPath) gitStore.refresh(workspace.rootPath);
});
const sidebarSize = ref(20);

// Unsaved changes dialog
const pendingCloseTabId = ref<string | null>(null);
const pendingCloseTab = computed(() =>
  pendingCloseTabId.value ? editorStore.tabs.find(t => t.id === pendingCloseTabId.value) ?? null : null
);

const requestCloseTab = (tabId: string) => {
  const tab = editorStore.tabs.find(t => t.id === tabId);
  if (tab?.isDirty) {
    pendingCloseTabId.value = tabId;
  } else {
    editorStore.closeTab(tabId);
  }
};

const onSaveThenClose = async () => {
  if (!pendingCloseTab.value) return;
  const tab = pendingCloseTab.value;
  if (tab.path) {
    try {
      const data = new TextEncoder().encode(tab.content);
      await haexVault.client.filesystem.writeFile(tab.path, data);
    } catch (e) {
      console.error("[haex-code] Failed to save file:", e);
    }
  }
  editorStore.closeTab(tab.id);
  pendingCloseTabId.value = null;
};

const onDiscardAndClose = () => {
  if (pendingCloseTab.value) {
    editorStore.closeTab(pendingCloseTab.value.id);
  }
  pendingCloseTabId.value = null;
};


const newFile = () => {
  editorStore.openTab({
    id: crypto.randomUUID(),
    path: "",
    name: "Untitled",
    content: "",
    language: "plaintext",
    isDirty: false,
  });
};

onMounted(async () => {
  await haexVault.initializeAsync();
  await settings.loadFromDb();
  await detectShells();
  if (terminalStore.tabs.length === 0) {
    terminalStore.addTab();
  }
  if (editorStore.tabs.length === 0) {
    newFile();
  }
  if (workspace.rootPath) {
    gitStore.refresh(workspace.rootPath);
  }
});

const openFolder = async () => {
  try {
    const folder = await haexVault.client.filesystem.selectFolder({
      title: t("openFolder"),
    });
    if (folder) {
      workspace.setRootPath(folder);
      await loadDirectory(folder, workspace.fileTree, 0);
      gitStore.refresh(folder);
    }
  } catch (e: any) {
    if (isPermissionPromptError(e)) {
      haexVault.setPermissionPrompt(e, openFolder);
    } else {
      console.error("[haex-code] Failed to open folder:", e);
    }
  }
};

const openFileFromDisk = async () => {
  try {
    const files = await haexVault.client.filesystem.selectFile({
      title: t("openFile"),
    });
    if (files && files.length > 0) {
      for (const filePath of files) {
        const data = await haexVault.client.filesystem.readFile(filePath);
        const content = new TextDecoder().decode(data);
        const name = filePath.split("/").pop() || filePath;
        editorStore.openTab({
          id: crypto.randomUUID(),
          path: filePath,
          name,
          content,
          language: detectLanguage(filePath),
          isDirty: false,
        });
      }
      if (isMobile.value) sidebarVisible.value = false;
    }
  } catch (e: any) {
    if (isPermissionPromptError(e)) {
      haexVault.setPermissionPrompt(e, openFileFromDisk);
    } else {
      console.error("[haex-code] Failed to open file:", e);
    }
  }
};

const loadDirectory = async (path: string, target: FileEntry[], depth: number) => {
  workspace.isLoading = true;
  try {
    const entries = await haexVault.client.filesystem.readDir(path);
    const sorted = entries.sort((a: any, b: any) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    target.length = 0;
    for (const entry of sorted) {
      target.push({
        name: entry.name,
        path: `${path}/${entry.name}`,
        isDirectory: entry.isDirectory,
        isExpanded: false,
        children: entry.isDirectory ? [] : undefined,
        depth,
      });
    }
  } catch (e: any) {
    if (isPermissionPromptError(e)) {
      haexVault.setPermissionPrompt(e, () => loadDirectory(path, target, depth));
    } else {
      console.error("[haex-code] Failed to load directory:", e);
    }
  } finally {
    workspace.isLoading = false;
  }
};

const toggleDirectory = async (entry: FileEntry) => {
  if (!entry.isDirectory) return;

  if (entry.isExpanded) {
    entry.isExpanded = false;
    return;
  }

  entry.isExpanded = true;
  if (entry.children && entry.children.length === 0) {
    await loadDirectory(entry.path, entry.children, entry.depth + 1);
  }
};

const openFile = async (entry: FileEntry) => {
  if (entry.isDirectory) {
    await toggleDirectory(entry);
    return;
  }

  try {
    const data = await haexVault.client.filesystem.readFile(entry.path);
    const content = new TextDecoder().decode(data);

    const tab: EditorTab = {
      id: crypto.randomUUID(),
      path: entry.path,
      name: entry.name,
      content,
      language: detectLanguage(entry.path),
      isDirty: false,
    };
    editorStore.openTab(tab);
    // Close sidebar on mobile after opening a file
    if (isMobile.value) sidebarVisible.value = false;
  } catch (e) {
    console.error("[haex-code] Failed to open file:", e);
  }
};

const saveActiveFile = async () => {
  const tab = editorStore.activeTab;
  if (!tab) return;

  if (tab.isDirty) {
    try {
      const data = new TextEncoder().encode(tab.content);
      await haexVault.client.filesystem.writeFile(tab.path, data);
      editorStore.markTabClean(tab.id);
    } catch (e) {
      console.error("[haex-code] Failed to save file:", e);
    }
  }

  if (workspace.rootPath) gitStore.refresh(workspace.rootPath);
};

const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveActiveFile();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "`") {
    e.preventDefault();
    terminalVisible.value = !terminalVisible.value;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "b") {
    e.preventDefault();
    sidebarVisible.value = !sidebarVisible.value;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    settingsVisible.value = !settingsVisible.value;
  }
};

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <div class="flex h-screen flex-col">
    <!-- ============================================================ -->
    <!-- MOBILE LAYOUT                                                 -->
    <!-- ============================================================ -->
    <MobileWorkspace
      v-if="isMobile"
      v-model:sidebar-visible="sidebarVisible"
      v-model:terminal-visible="terminalVisible"
      v-model:sidebar-tab="sidebarTab"
      :shells="shells"
      @new-file="newFile"
      @close-tab="requestCloseTab"
      @save="saveActiveFile"
      @select-entry="openFile"
      @toggle-entry="toggleDirectory"
      @open-folder="openFolder"
      @open-file-from-disk="openFileFromDisk"
      @open-settings="settingsVisible = true"
    />

    <!-- ============================================================ -->
    <!-- DESKTOP LAYOUT                                                -->
    <!-- ============================================================ -->
    <DesktopWorkspace
      v-else
      v-model:sidebar-visible="sidebarVisible"
      v-model:terminal-visible="terminalVisible"
      v-model:sidebar-tab="sidebarTab"
      v-model:sidebar-size="sidebarSize"
      :shells="shells"
      @new-file="newFile"
      @close-tab="requestCloseTab"
      @save="saveActiveFile"
      @select-entry="openFile"
      @toggle-entry="toggleDirectory"
      @open-folder="openFolder"
      @open-file-from-disk="openFileFromDisk"
      @open-settings="settingsVisible = true"
    />

    <!-- Settings Overlay -->
    <SettingsPanel v-if="settingsVisible" @close="settingsVisible = false" />

    <!-- Unsaved Changes Dialog -->
    <UnsavedChangesDialog
      v-if="pendingCloseTab"
      :file-name="pendingCloseTab.name"
      @save="onSaveThenClose"
      @discard="onDiscardAndClose"
      @cancel="pendingCloseTabId = null"
    />
  </div>
</template>

<i18n lang="yaml">
de:
  openFile: Datei öffnen
  openFolder: Ordner öffnen
  newTerminal: Neues Terminal
en:
  openFile: Open File
  openFolder: Open Folder
  newTerminal: New Terminal
</i18n>
