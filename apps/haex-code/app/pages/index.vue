<script setup lang="ts">
import { GripHorizontal } from "@lucide/vue";
import { toast } from "vue-sonner";
import { isPermissionDeniedError } from "@haex-space/vault-sdk";
import { errorMessage } from "~/lib/errors";
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
// Plain DOM element: a deep ref would hand Teleport a proxy.
const terminalHost = shallowRef<HTMLElement | null>(null);

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

// Permission prompts are answered and retried inside the SDK; what still fails here is reported.
const reportError = (title: string, error: unknown) => {
  console.error(`[haex-code] ${title}`, error);
  toast.error(title, {
    description: isPermissionDeniedError(error) ? t("permissionDenied") : errorMessage(error),
  });
};

// Saving writes UTF-8, so a file in another encoding (or a binary file) would be silently rewritten.
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** The file's text, or null (reported) when it is not valid UTF-8. */
const decodeTextFile = (data: Uint8Array, name: string): string | null => {
  try {
    return utf8.decode(data);
  } catch {
    toast.error(t("notUtf8", { name }));
    return null;
  }
};

const saveTabReportingErrorsAsync = async (tab: EditorTab): Promise<boolean> => {
  try {
    return await editorStore.saveTabAsync(tab.id);
  } catch (e) {
    reportError(t("saveFailed", { name: tab.name }), e);
    return false;
  }
};

const onSaveThenClose = async () => {
  const tab = pendingCloseTab.value;
  if (!tab) return;
  if (!(await saveTabReportingErrorsAsync(tab))) return;
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
  } catch (e) {
    reportError(t("openFolderFailed"), e);
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
        const name = filePath.split("/").pop() || filePath;
        const content = decodeTextFile(data, name);
        if (content === null) continue;
        editorStore.openTab({
          id: crypto.randomUUID(),
          path: filePath,
          name,
          content,
          language: detectLanguage(filePath),
        });
      }
      if (isMobile.value) sidebarVisible.value = false;
    }
  } catch (e) {
    reportError(t("openFileFailed"), e);
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
  } catch (e) {
    reportError(t("readFolderFailed"), e);
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
    const content = decodeTextFile(data, entry.name);
    if (content === null) return;

    editorStore.openTab({
      id: crypto.randomUUID(),
      path: entry.path,
      name: entry.name,
      content,
      language: detectLanguage(entry.path),
    });
    // Close sidebar on mobile after opening a file
    if (isMobile.value) sidebarVisible.value = false;
  } catch (e) {
    reportError(t("openFileFailed"), e);
  }
};

const saveActiveFile = async () => {
  const tab = editorStore.activeTab;
  if (!tab) return;

  if (tab.isDirty) await saveTabReportingErrorsAsync(tab);

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
      v-model:terminal-host="terminalHost"
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
      v-model:terminal-host="terminalHost"
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

    <!-- Terminals stay mounted while their panel is hidden; closing a terminal tab ends its shell. -->
    <div class="hidden">
      <Teleport :to="terminalHost ?? 'body'" :disabled="!terminalHost">
        <TerminalView
          v-for="tab in terminalStore.tabs"
          v-show="tab.id === terminalStore.activeTabId"
          :key="tab.id"
          :tab="tab"
        />
      </Teleport>
    </div>

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
  saveFailed: "{name} konnte nicht gespeichert werden."
  openFileFailed: Datei konnte nicht geöffnet werden
  openFolderFailed: Ordner konnte nicht geöffnet werden
  readFolderFailed: Ordnerinhalt konnte nicht gelesen werden
  permissionDenied: Zugriff verweigert
  notUtf8: "{name} ist keine UTF-8-Textdatei und wird nicht geöffnet."
en:
  openFile: Open File
  openFolder: Open Folder
  newTerminal: New Terminal
  saveFailed: "Could not save {name}."
  openFileFailed: Could not open the file
  openFolderFailed: Could not open the folder
  readFolderFailed: Could not read the folder
  permissionDenied: Permission denied
  notUtf8: "{name} is not a UTF-8 text file and was not opened."
</i18n>
