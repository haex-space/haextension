<script setup lang="ts">
import { Splitpanes, Pane } from "splitpanes";
import "splitpanes/dist/splitpanes.css";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  FolderOpen,
  X,
  Terminal as TerminalIcon,
  FileCode2,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen as FolderOpenIcon,
} from "lucide-vue-next";

import type { FileEntry, EditorTab } from "~/types";

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const workspace = useWorkspaceStore();
const editorStore = useEditorStore();
const terminalStore = useTerminalStore();
const { detectLanguage } = useLanguageDetection();

const sidebarVisible = ref(true);
const terminalVisible = ref(true);
const sidebarSize = ref(20);
const terminalSize = ref(30);

onMounted(async () => {
  await haexVault.initializeAsync();
  terminalStore.addTab();
});

const openFolder = async () => {
  try {
    const folder = await haexVault.client.filesystem.selectFolder({
      title: t("openFolder"),
    });
    if (folder) {
      workspace.setRootPath(folder);
      await loadDirectory(folder, workspace.fileTree, 0);
    }
  } catch (e) {
    console.error("[haex-code] Failed to open folder:", e);
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
  } catch (e) {
    console.error("[haex-code] Failed to open file:", e);
  }
};

const saveActiveFile = async () => {
  const tab = editorStore.activeTab;
  if (!tab || !tab.isDirty) return;

  try {
    const data = new TextEncoder().encode(tab.content);
    await haexVault.client.filesystem.writeFile(tab.path, data);
    editorStore.markTabClean(tab.id);
  } catch (e) {
    console.error("[haex-code] Failed to save file:", e);
  }
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
};

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <div class="flex h-screen flex-col">
    <Splitpanes class="flex-1">
      <!-- Sidebar -->
      <Pane v-if="sidebarVisible" :size="sidebarSize" :min-size="15" :max-size="40">
        <div class="flex h-full flex-col border-r border-border bg-sidebar text-sidebar-foreground">
          <!-- Sidebar Header -->
          <div class="flex items-center justify-between border-b border-border px-3 py-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {{ workspace.workspaceName || t("explorer") }}
            </span>
            <div class="flex items-center gap-1">
              <button
                class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                :title="t('openFolder')"
                @click="openFolder"
              >
                <FolderOpen class="size-4" />
              </button>
              <button
                class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                :title="t('hideSidebar')"
                @click="sidebarVisible = false"
              >
                <PanelLeftClose class="size-4" />
              </button>
            </div>
          </div>

          <!-- File Tree -->
          <div class="flex-1 overflow-y-auto text-sm">
            <template v-if="workspace.rootPath">
              <div
                v-for="entry in workspace.fileTree"
                :key="entry.path"
              >
                <FileTreeNode :entry="entry" @select="openFile" @toggle="toggleDirectory" />
              </div>
            </template>
            <div v-else class="flex flex-col items-center gap-3 p-6 text-center text-muted-foreground">
              <FolderOpen class="size-10 opacity-50" />
              <p class="text-xs">{{ t("noFolder") }}</p>
              <button
                class="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                @click="openFolder"
              >
                {{ t("openFolder") }}
              </button>
            </div>
          </div>
        </div>
      </Pane>

      <!-- Main Area (Editor + Terminal) -->
      <Pane :min-size="30">
        <Splitpanes horizontal>
          <!-- Editor Area -->
          <Pane :min-size="20">
            <div class="flex h-full flex-col">
              <!-- Tab Bar -->
              <div v-if="editorStore.tabs.length > 0" class="flex items-center border-b border-border bg-background">
                <div class="flex flex-1 overflow-x-auto">
                  <button
                    v-for="tab in editorStore.tabs"
                    :key="tab.id"
                    class="group flex items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs"
                    :class="tab.id === editorStore.activeTabId
                      ? 'bg-card text-foreground'
                      : 'bg-background text-muted-foreground hover:bg-accent'"
                    @click="editorStore.activeTabId = tab.id"
                  >
                    <FileCode2 class="size-3.5" />
                    <span>{{ tab.name }}</span>
                    <span v-if="tab.isDirty" class="size-2 rounded-full bg-primary" />
                    <button
                      class="ml-1 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
                      @click.stop="editorStore.closeTab(tab.id)"
                    >
                      <X class="size-3" />
                    </button>
                  </button>
                </div>
              </div>

              <!-- Editor Content -->
              <div class="flex-1">
                <template v-if="editorStore.activeTab">
                  <MonacoEditor
                    :tab="editorStore.activeTab"
                    @update:content="(content) => editorStore.updateTabContent(editorStore.activeTabId!, content)"
                    @save="saveActiveFile"
                  />
                </template>
                <div v-else class="flex h-full items-center justify-center text-muted-foreground">
                  <div class="text-center">
                    <FileCode2 class="mx-auto mb-3 size-12 opacity-30" />
                    <p class="text-sm">{{ t('openFileToEdit') }}</p>
                    <div class="mt-4 space-y-1 text-xs text-muted-foreground/70">
                      <p><kbd class="rounded bg-muted px-1.5 py-0.5">Ctrl+B</kbd> {{ t('toggleSidebar') }}</p>
                      <p><kbd class="rounded bg-muted px-1.5 py-0.5">Ctrl+`</kbd> {{ t('toggleTerminal') }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Pane>

          <!-- Terminal Area -->
          <Pane v-if="terminalVisible" :size="terminalSize" :min-size="10" :max-size="80">
            <div class="flex h-full flex-col border-t border-border">
              <!-- Terminal Tab Bar -->
              <div class="flex items-center justify-between border-b border-border bg-background px-2 py-1">
                <div class="flex items-center gap-1 overflow-x-auto">
                  <button
                    v-for="tab in terminalStore.tabs"
                    :key="tab.id"
                    class="group flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                    :class="tab.id === terminalStore.activeTabId
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50'"
                    @click="terminalStore.activeTabId = tab.id"
                  >
                    <TerminalIcon class="size-3" />
                    <span>{{ tab.name }}</span>
                    <button
                      class="ml-1 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
                      @click.stop="terminalStore.closeTab(tab.id)"
                    >
                      <X class="size-3" />
                    </button>
                  </button>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    :title="t('newTerminal')"
                    @click="terminalStore.addTab()"
                  >
                    <Plus class="size-3.5" />
                  </button>
                  <button
                    class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    @click="terminalVisible = false"
                  >
                    <X class="size-3.5" />
                  </button>
                </div>
              </div>

              <!-- Terminal Content -->
              <div class="flex-1 bg-black">
                <TerminalView
                  v-for="tab in terminalStore.tabs"
                  v-show="tab.id === terminalStore.activeTabId"
                  :key="tab.id"
                  :tab="tab"
                />
              </div>
            </div>
          </Pane>
        </Splitpanes>
      </Pane>
    </Splitpanes>

    <!-- Statusbar -->
    <div class="flex h-6 items-center justify-between border-t border-border bg-primary px-3 text-xs text-primary-foreground">
      <div class="flex items-center gap-3">
        <button
          v-if="!sidebarVisible"
          class="hover:text-primary-foreground/80"
          @click="sidebarVisible = true"
        >
          <PanelLeftOpen class="size-3.5" />
        </button>
        <span v-if="workspace.rootPath" class="opacity-80">{{ workspace.workspaceName }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="editorStore.activeTab" class="opacity-80">
          {{ editorStore.activeTab.language }}
        </span>
        <button
          v-if="!terminalVisible"
          class="hover:text-primary-foreground/80"
          @click="terminalVisible = true"
        >
          <TerminalIcon class="size-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  explorer: Explorer
  openFolder: Ordner öffnen
  hideSidebar: Sidebar ausblenden
  noFolder: Kein Ordner geöffnet
  openFileToEdit: Datei öffnen zum Bearbeiten
  toggleSidebar: Sidebar ein-/ausblenden
  toggleTerminal: Terminal ein-/ausblenden
  newTerminal: Neues Terminal
en:
  explorer: Explorer
  openFolder: Open Folder
  hideSidebar: Hide sidebar
  noFolder: No folder opened
  openFileToEdit: Open a file to start editing
  toggleSidebar: Toggle sidebar
  toggleTerminal: Toggle terminal
  newTerminal: New Terminal
</i18n>
