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
  ZoomIn,
  ZoomOut,
} from "lucide-vue-next";

import {
  ChevronDown as ChevronDownIcon,
} from "lucide-vue-next";
import type { FileEntry, EditorTab } from "~/types";
import type { UiScale } from "~/stores/settings";

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const workspace = useWorkspaceStore();
const editorStore = useEditorStore();
const terminalStore = useTerminalStore();
const settings = useSettingsStore();
const { detectLanguage } = useLanguageDetection();
const { shells, detectShells } = useAvailableShells();

const SCALES: UiScale[] = ["compact", "default", "comfortable", "spacious"];
const cycleScale = () => {
  const idx = SCALES.indexOf(settings.uiScale);
  settings.uiScale = SCALES[(idx + 1) % SCALES.length];
};

const sidebarVisible = ref(true);
const terminalVisible = ref(true);
const sidebarSize = ref(20);
const terminalSize = ref(30);

onMounted(async () => {
  await haexVault.initializeAsync();
  await detectShells();
  if (terminalStore.tabs.length === 0) {
    terminalStore.addTab();
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
    }
  } catch (e: any) {
    if (isPermissionPromptError(e)) {
      haexVault.setPermissionPrompt(e, openFolder);
    } else {
      console.error("[haex-code] Failed to open folder:", e);
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
      <!-- Sidebar Toggle (when closed) -->
      <Pane v-if="!sidebarVisible" :size="3" :min-size="3" :max-size="3">
        <div class="flex h-full flex-col items-center border-r border-border bg-sidebar pt-3">
          <button
            class="rounded-md p-2.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            :title="t('toggleSidebar') + ' (Ctrl+B)'"
            @click="sidebarVisible = true"
          >
            <PanelLeftOpen class="size-6" />
          </button>
        </div>
      </Pane>

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
          <ShadcnScrollArea class="flex-1 text-sm">
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
          </ShadcnScrollArea>
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
                  <div
                    v-for="tab in editorStore.tabs"
                    :key="tab.id"
                    class="group flex cursor-pointer items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs"
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
                  </div>
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
              <!-- Terminal Header -->
              <div class="flex items-center justify-between border-b border-border bg-background px-3 py-1">
                <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {{ t('terminal') }}
                </span>
                <div class="flex items-center gap-1">
                  <ShadcnDropdownMenu>
                    <ShadcnDropdownMenuTrigger as-child>
                      <button class="flex items-center gap-0.5 rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                        <Plus class="size-3.5" />
                        <ChevronDownIcon class="size-3" />
                      </button>
                    </ShadcnDropdownMenuTrigger>
                    <ShadcnDropdownMenuContent align="end" class="min-w-32">
                      <ShadcnDropdownMenuItem
                        v-for="shell in shells"
                        :key="shell.path"
                        @click="terminalStore.addTab(shell.name, shell.path)"
                      >
                        <TerminalIcon class="mr-2 size-3.5" />
                        {{ shell.name }}
                      </ShadcnDropdownMenuItem>
                    </ShadcnDropdownMenuContent>
                  </ShadcnDropdownMenu>
                  <button
                    class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    @click="terminalVisible = false"
                  >
                    <X class="size-3.5" />
                  </button>
                </div>
              </div>

              <!-- Terminal Body: Content + Session List -->
              <div class="flex flex-1">
                <!-- Terminal Content -->
                <div class="flex-1 bg-black">
                  <TerminalView
                    v-for="tab in terminalStore.tabs"
                    v-show="tab.id === terminalStore.activeTabId"
                    :key="tab.id"
                    :tab="tab"
                  />
                </div>

                <!-- Terminal Session List (right sidebar) -->
                <ShadcnScrollArea v-if="terminalStore.tabs.length > 1" class="w-40 border-l border-border bg-background">
                  <div
                    v-for="tab in terminalStore.tabs"
                    :key="tab.id"
                    class="group flex cursor-pointer items-center gap-1.5 border-b border-border px-2 py-1.5 text-xs"
                    :class="tab.id === terminalStore.activeTabId
                      ? 'bg-accent/50 text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/30'"
                    @click="terminalStore.activeTabId = tab.id"
                  >
                    <TerminalIcon class="size-3.5 shrink-0" />
                    <span class="flex-1 truncate">{{ tab.name }}</span>
                    <button
                      class="shrink-0 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
                      @click.stop="terminalStore.closeTab(tab.id)"
                    >
                      <X class="size-3" />
                    </button>
                  </div>
                </ShadcnScrollArea>
              </div>
            </div>
          </Pane>
        </Splitpanes>
      </Pane>
    </Splitpanes>

    <!-- Statusbar -->
    <div class="flex h-7 items-center justify-between border-t border-border bg-primary px-2 text-xs text-primary-foreground">
      <div class="flex items-center gap-1">
        <span v-if="workspace.rootPath" class="opacity-80">{{ workspace.workspaceName }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="rounded px-1.5 py-0.5 opacity-80 hover:bg-primary-foreground/20 hover:opacity-100"
          :title="`UI: ${settings.uiScale}`"
          @click="cycleScale"
        >
          {{ settings.uiScale }}
        </button>
        <span v-if="editorStore.activeTab" class="px-1 opacity-80">
          {{ editorStore.activeTab.language }}
        </span>
        <button
          class="rounded px-1.5 py-0.5 hover:bg-primary-foreground/20"
          :title="terminalVisible ? t('toggleTerminal') : t('toggleTerminal')"
          @click="terminalVisible = !terminalVisible"
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
  terminal: Terminal
en:
  explorer: Explorer
  openFolder: Open Folder
  hideSidebar: Hide sidebar
  noFolder: No folder opened
  openFileToEdit: Open a file to start editing
  toggleSidebar: Toggle sidebar
  toggleTerminal: Toggle terminal
  newTerminal: New Terminal
  terminal: Terminal
</i18n>
