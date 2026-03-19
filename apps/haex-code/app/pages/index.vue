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
  ChevronDown as ChevronDownIcon,
  Settings,
  GitBranch,
  GitCommit,
  Globe,
  GripHorizontal,
  FileUp,
} from "lucide-vue-next";
import type { FileEntry, EditorTab } from "~/types";
import type { UiScale } from "~/stores/settings";

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

const showSshDialog = ref(false);
const isDesktop = computed(() => {
  const p = haexVault.state.context?.platform;
  return p !== "android" && p !== "ios";
});

const connectSsh = (host: string, port: number, username: string) => {
  const sshCmd = `/usr/bin/ssh`;
  const args = `-o StrictHostKeyChecking=no -p ${port} ${username}@${host}`;
  terminalStore.addTab(`${username}@${host}`, `${sshCmd} ${args}`);
};

const SCALES: UiScale[] = ["compact", "default", "comfortable", "spacious"];
const cycleScale = () => {
  const idx = SCALES.indexOf(settings.uiScale as UiScale);
  settings.uiScale = SCALES[(idx + 1) % SCALES.length] as UiScale;
};

const sidebarVisible = ref(true);
const terminalVisible = ref(true);
const settingsVisible = ref(false);
const sidebarTab = ref<"explorer" | "git">("explorer");

watch(sidebarTab, (tab) => {
  if (tab === "git" && workspace.rootPath) gitStore.refresh(workspace.rootPath);
});
const sidebarSize = ref(20);
const terminalSize = ref(30);


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
    <template v-if="isMobile">
      <!-- Mobile Toolbar -->
      <div class="flex items-center justify-between border-b border-border bg-background px-2 py-1.5">
        <div class="flex items-center gap-1">
          <button
            class="rounded-md p-2.5 text-muted-foreground hover:bg-accent active:bg-accent/70"
            @click="sidebarVisible = true"
          >
            <PanelLeftOpen class="size-5" />
          </button>
          <span class="text-xs font-semibold text-muted-foreground truncate max-w-32">
            {{ workspace.workspaceName || t("explorer") }}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="rounded-md p-2.5 text-muted-foreground hover:bg-accent active:bg-accent/70"
            @click="terminalVisible = true"
          >
            <TerminalIcon class="size-5" />
          </button>
          <button
            class="rounded-md p-2.5 text-muted-foreground hover:bg-accent active:bg-accent/70"
            @click="settingsVisible = true"
          >
            <Settings class="size-5" />
          </button>
        </div>
      </div>

      <!-- Mobile Editor Area -->
      <div class="flex flex-1 flex-col min-h-0">
        <!-- Tab Bar -->
        <DraggableTabBar
          v-if="editorStore.tabs.length > 0"
          :tabs="editorStore.tabs"
          :active-tab-id="editorStore.activeTabId"
          @select="editorStore.activeTabId = $event"
          @close="editorStore.closeTab($event)"
          @reorder="(from: number, to: number) => editorStore.moveTab(from, to)"
          @new-file="newFile"
        />

        <!-- Editor Content -->
        <div class="flex-1 min-h-0">
          <template v-if="editorStore.activeTab">
            <MonacoEditor
              :tab="editorStore.activeTab"
              @update:content="(content) => editorStore.updateTabContent(editorStore.activeTabId!, content)"
              @save="saveActiveFile"
            />
          </template>
          <div v-else class="flex h-full items-center justify-center text-muted-foreground">
            <div class="text-center px-6">
              <FileCode2 class="mx-auto mb-3 size-12 opacity-30" />
              <p class="text-sm">{{ t('openFileToEdit') }}</p>
              <button
                class="mt-4 rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground active:bg-primary/80"
                @click="sidebarVisible = true"
              >
                {{ t("openFolder") }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile Sidebar (Sheet from left) -->
      <ShadcnSheet :open="sidebarVisible" @update:open="sidebarVisible = $event">
        <ShadcnSheetContent side="left" class="w-[85%] max-w-sm p-0 [&>button:last-child]:hidden">
          <ShadcnSheetTitle class="sr-only">{{ t("explorer") }}</ShadcnSheetTitle>
          <ShadcnSheetDescription class="sr-only">{{ t("explorer") }}</ShadcnSheetDescription>
          <div class="flex h-full flex-col bg-sidebar text-sidebar-foreground">
            <!-- Sidebar Header -->
            <div class="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {{ workspace.workspaceName || t("explorer") }}
              </span>
              <div class="flex items-center gap-1">
                <button
                  class="rounded-md p-2.5 text-muted-foreground hover:bg-accent active:bg-accent/70"
                  :title="t('openFile')"
                  @click="openFileFromDisk"
                >
                  <FileUp class="size-5" />
                </button>
                <button
                  class="rounded-md p-2.5 text-muted-foreground hover:bg-accent active:bg-accent/70"
                  :title="t('openFolder')"
                  @click="openFolder"
                >
                  <FolderOpen class="size-5" />
                </button>
                <button
                  class="rounded-md p-2.5 text-muted-foreground hover:bg-accent active:bg-accent/70"
                  @click="sidebarVisible = false"
                >
                  <X class="size-5" />
                </button>
              </div>
            </div>

            <!-- Sidebar Tabs -->
            <div class="flex border-b border-border">
              <button
                class="flex flex-1 items-center justify-center gap-1.5 py-3 text-sm"
                :class="sidebarTab === 'explorer' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'"
                @click="sidebarTab = 'explorer'"
              >
                <FolderOpen class="size-4" />
                Explorer
              </button>
              <button
                class="flex flex-1 items-center justify-center gap-1.5 py-3 text-sm"
                :class="sidebarTab === 'git' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'"
                @click="sidebarTab = 'git'"
              >
                <GitCommit class="size-4" />
                Source Control
                <span v-if="gitStore.files.length > 0" class="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {{ gitStore.files.length }}
                </span>
              </button>
            </div>

            <!-- Explorer -->
            <ShadcnScrollArea v-if="sidebarTab === 'explorer'" class="flex-1 text-sm">
              <template v-if="workspace.rootPath">
                <div v-for="entry in workspace.fileTree" :key="entry.path">
                  <FileTreeNode :entry="entry" @select="openFile" @toggle="toggleDirectory" />
                </div>
              </template>
              <div v-else class="flex flex-col items-center gap-4 p-8 text-center text-muted-foreground">
                <FolderOpen class="size-12 opacity-50" />
                <p class="text-sm">{{ t("noFolder") }}</p>
                <button
                  class="rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground active:bg-primary/80"
                  @click="openFolder"
                >
                  {{ t("openFolder") }}
                </button>
              </div>
            </ShadcnScrollArea>

            <!-- Source Control -->
            <GitPanel v-else-if="sidebarTab === 'git'" />
          </div>
        </ShadcnSheetContent>
      </ShadcnSheet>

      <!-- Mobile Terminal (Drawer from bottom) -->
      <ShadcnDrawer :open="terminalVisible" @update:open="terminalVisible = $event">
        <ShadcnDrawerContent class="h-[70vh]">
          <ShadcnDrawerTitle class="sr-only">{{ t("terminal") }}</ShadcnDrawerTitle>
          <ShadcnDrawerDescription class="sr-only">{{ t("terminal") }}</ShadcnDrawerDescription>
          <!-- Drag handle -->
          <div class="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/30" />

          <!-- Terminal Header -->
          <div class="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {{ t('terminal') }}
            </span>
            <div class="flex items-center gap-1">
              <ShadcnDropdownMenu>
                <ShadcnDropdownMenuTrigger as-child>
                  <button class="flex items-center gap-1 rounded-md p-2.5 text-muted-foreground hover:bg-accent active:bg-accent/70">
                    <Plus class="size-5" />
                    <ChevronDownIcon class="size-4" />
                  </button>
                </ShadcnDropdownMenuTrigger>
                <ShadcnDropdownMenuContent align="end" class="min-w-40">
                  <ShadcnDropdownMenuItem
                    v-for="shell in shells"
                    :key="shell.path"
                    class="py-3 text-sm"
                    @click="terminalStore.addTab(shell.name, shell.path)"
                  >
                    <TerminalIcon class="mr-2 size-5" />
                    {{ shell.name }}
                  </ShadcnDropdownMenuItem>
                  <ShadcnDropdownMenuSeparator v-if="isDesktop" />
                  <ShadcnDropdownMenuItem
                    v-if="isDesktop"
                    class="py-3 text-sm"
                    @click="showSshDialog = true"
                  >
                    <Globe class="mr-2 size-5" />
                    SSH
                  </ShadcnDropdownMenuItem>
                </ShadcnDropdownMenuContent>
              </ShadcnDropdownMenu>
            </div>
          </div>

          <!-- Terminal Tabs (horizontal scroll on mobile) -->
          <div v-if="terminalStore.tabs.length > 1" class="flex gap-1 overflow-x-auto border-b border-border px-2 py-1">
            <div
              v-for="tab in terminalStore.tabs"
              :key="tab.id"
              class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 text-xs"
              :class="tab.id === terminalStore.activeTabId
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground'"
              @click="terminalStore.activeTabId = tab.id"
            >
              <TerminalIcon class="size-3.5" />
              {{ tab.name }}
              <button
                class="ml-1 rounded p-0.5 hover:bg-accent"
                @click.stop="terminalStore.closeTab(tab.id)"
              >
                <X class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Terminal Content -->
          <div class="flex-1 bg-black min-h-0">
            <TerminalView
              v-for="tab in terminalStore.tabs"
              v-show="tab.id === terminalStore.activeTabId"
              :key="tab.id"
              :tab="tab"
            />
          </div>
        </ShadcnDrawerContent>
      </ShadcnDrawer>
    </template>

    <!-- ============================================================ -->
    <!-- DESKTOP LAYOUT                                                -->
    <!-- ============================================================ -->
    <template v-else>
      <Splitpanes class="flex-1 min-h-0">
        <!-- Sidebar Toggle (when closed) -->
        <Pane v-if="!sidebarVisible" :size="3" :min-size="3" :max-size="3">
          <div class="flex h-full flex-col items-center border-r border-border bg-sidebar pt-3">
            <button
              class="rounded-md p-2.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              :title="t('toggleSidebar') + ' (Ctrl+B)'"
              @click="sidebarVisible = true"
            >
              <PanelLeftOpen class="size-5" />
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
                  class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  :title="t('openFile')"
                  @click="openFileFromDisk"
                >
                  <FileUp class="size-4" />
                </button>
                <button
                  class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  :title="t('openFolder')"
                  @click="openFolder"
                >
                  <FolderOpen class="size-4" />
                </button>
                <button
                  class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  :title="t('hideSidebar')"
                  @click="sidebarVisible = false"
                >
                  <PanelLeftClose class="size-4" />
                </button>
              </div>
            </div>

            <!-- Sidebar Tabs -->
            <div class="flex border-b border-border">
              <button
                class="flex flex-1 items-center justify-center gap-1 py-2 text-xs"
                :class="sidebarTab === 'explorer' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="sidebarTab = 'explorer'"
              >
                <FolderOpen class="size-3.5" />
                Explorer
              </button>
              <button
                class="flex flex-1 items-center justify-center gap-1 py-2 text-xs"
                :class="sidebarTab === 'git' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="sidebarTab = 'git'"
              >
                <GitCommit class="size-3.5" />
                Source Control
                <span v-if="gitStore.files.length > 0" class="rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                  {{ gitStore.files.length }}
                </span>
              </button>
            </div>

            <!-- Explorer -->
            <ShadcnScrollArea v-if="sidebarTab === 'explorer'" class="flex-1 text-sm">
              <template v-if="workspace.rootPath">
                <div v-for="entry in workspace.fileTree" :key="entry.path">
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

            <!-- Source Control -->
            <GitPanel v-else-if="sidebarTab === 'git'" />
          </div>
        </Pane>

        <!-- Main Area (Editor + Terminal) -->
        <Pane :min-size="30">
          <Splitpanes horizontal>
            <!-- Editor Area -->
            <Pane :min-size="20">
              <div class="flex h-full flex-col">
                <!-- Tab Bar -->
                <DraggableTabBar
                  v-if="editorStore.tabs.length > 0"
                  :tabs="editorStore.tabs"
                  :active-tab-id="editorStore.activeTabId"
                  @select="editorStore.activeTabId = $event"
                  @close="editorStore.closeTab($event)"
                  @reorder="(from: number, to: number) => editorStore.moveTab(from, to)"
                />

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
                        <button class="flex items-center gap-0.5 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                          <Plus class="size-4" />
                          <ChevronDownIcon class="size-3" />
                        </button>
                      </ShadcnDropdownMenuTrigger>
                      <ShadcnDropdownMenuContent align="end" class="min-w-36">
                        <ShadcnDropdownMenuItem
                          v-for="shell in shells"
                          :key="shell.path"
                          class="py-2"
                          @click="terminalStore.addTab(shell.name, shell.path)"
                        >
                          <TerminalIcon class="mr-2 size-4" />
                          {{ shell.name }}
                        </ShadcnDropdownMenuItem>
                        <ShadcnDropdownMenuSeparator v-if="isDesktop" />
                        <ShadcnDropdownMenuItem
                          v-if="isDesktop"
                          class="py-2"
                          @click="showSshDialog = true"
                        >
                          <Globe class="mr-2 size-4" />
                          SSH
                        </ShadcnDropdownMenuItem>
                      </ShadcnDropdownMenuContent>
                    </ShadcnDropdownMenu>
                    <button
                      class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      @click="terminalVisible = false"
                    >
                      <X class="size-4" />
                    </button>
                  </div>
                </div>

                <!-- Terminal Body: Content + Session List -->
                <div class="flex flex-1">
                  <!-- Terminal Content -->
                  <div class="relative flex-1 bg-black">
                    <TerminalView
                      v-for="tab in terminalStore.tabs"
                      v-show="tab.id === terminalStore.activeTabId"
                      :key="tab.id"
                      :tab="tab"
                    />
                  </div>

                  <!-- Terminal Session List (right sidebar) -->
                  <ShadcnScrollArea v-if="terminalStore.tabs.length > 1" class="w-44 border-l border-border bg-background">
                    <div
                      v-for="tab in terminalStore.tabs"
                      :key="tab.id"
                      class="group flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm"
                      :class="tab.id === terminalStore.activeTabId
                        ? 'bg-accent/50 text-foreground'
                        : 'text-muted-foreground hover:bg-accent/30'"
                      @click="terminalStore.activeTabId = tab.id"
                    >
                      <TerminalIcon class="size-4 shrink-0" />
                      <span class="flex-1 truncate">{{ tab.name }}</span>
                      <button
                        class="shrink-0 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
                        @click.stop="terminalStore.closeTab(tab.id)"
                      >
                        <X class="size-3.5" />
                      </button>
                    </div>
                  </ShadcnScrollArea>
                </div>
              </div>
            </Pane>
          </Splitpanes>
        </Pane>
      </Splitpanes>

      <!-- Desktop Statusbar -->
      <div class="flex h-7 items-center justify-between border-t border-border bg-primary px-2 text-xs text-primary-foreground">
        <div class="flex items-center gap-2">
          <button
            v-if="gitStore.isRepo && gitStore.branch"
            class="flex items-center gap-1 rounded px-1 opacity-80 hover:bg-primary-foreground/20 hover:opacity-100"
            :title="'Branch: ' + gitStore.branch"
            @click="sidebarVisible = true; sidebarTab = 'git'"
          >
            <GitBranch class="size-3" />
            {{ gitStore.branch }}
          </button>
          <span v-else-if="workspace.rootPath" class="opacity-80">{{ workspace.workspaceName }}</span>
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
            :title="t('toggleTerminal')"
            @click="terminalVisible = !terminalVisible"
          >
            <TerminalIcon class="size-3.5" />
          </button>
          <button
            class="rounded px-1.5 py-0.5 hover:bg-primary-foreground/20"
            :title="t('settings')"
            @click="settingsVisible = true"
          >
            <Settings class="size-3.5" />
          </button>
        </div>
      </div>
    </template>

    <!-- Settings Overlay -->
    <SettingsPanel v-if="settingsVisible" @close="settingsVisible = false" />

    <!-- SSH Connect Dialog -->
    <SshConnectDialog
      v-if="showSshDialog"
      @close="showSshDialog = false"
      @connect="(host, port, username) => { showSshDialog = false; connectSsh(host, port, username); }"
    />
  </div>
</template>

<i18n lang="yaml">
de:
  explorer: Explorer
  openFile: Datei öffnen
  openFolder: Ordner öffnen
  hideSidebar: Sidebar ausblenden
  noFolder: Kein Ordner geöffnet
  openFileToEdit: Datei öffnen zum Bearbeiten
  toggleSidebar: Sidebar ein-/ausblenden
  toggleTerminal: Terminal ein-/ausblenden
  newTerminal: Neues Terminal
  terminal: Terminal
  settings: Einstellungen
en:
  explorer: Explorer
  openFile: Open File
  openFolder: Open Folder
  hideSidebar: Hide sidebar
  noFolder: No folder opened
  openFileToEdit: Open a file to start editing
  toggleSidebar: Toggle sidebar
  toggleTerminal: Toggle terminal
  newTerminal: New Terminal
  terminal: Terminal
  settings: Settings
</i18n>
