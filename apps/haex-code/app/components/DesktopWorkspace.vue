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
  FileUp,
  Menu,
} from "@lucide/vue";
import type { FileEntry } from "~/types";
import type { UiScale } from "~/stores/settings";

defineProps<{
  shells: { name: string; path: string }[];
}>();

const emit = defineEmits<{
  newFile: [];
  closeTab: [tabId: string];
  save: [];
  selectEntry: [entry: FileEntry];
  toggleEntry: [entry: FileEntry];
  openFolder: [];
  openFileFromDisk: [];
  openSettings: [];
}>();

const sidebarVisible = defineModel<boolean>("sidebarVisible", { required: true });
const terminalVisible = defineModel<boolean>("terminalVisible", { required: true });
const sidebarTab = defineModel<"explorer" | "git">("sidebarTab", { required: true });
const sidebarSize = defineModel<number>("sidebarSize", { required: true });

const { t } = useI18n();
const workspace = useWorkspaceStore();
const editorStore = useEditorStore();
const terminalStore = useTerminalStore();
const settings = useSettingsStore();
const gitStore = useGitStore();

const SCALES: UiScale[] = ["compact", "default", "comfortable", "spacious"];
const cycleScale = () => {
  const idx = SCALES.indexOf(settings.uiScale as UiScale);
  settings.uiScale = SCALES[(idx + 1) % SCALES.length] as UiScale;
};

const terminalSize = ref(30);
</script>

<template>
  <Splitpanes class="flex-1 min-h-0" @resized="(panes: any[]) => { if (sidebarVisible && panes[0]) sidebarSize = panes[0].size }">
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
            <ShadcnDropdownMenu>
              <ShadcnDropdownMenuTrigger as-child>
                <button class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  <Menu class="size-4" />
                </button>
              </ShadcnDropdownMenuTrigger>
              <ShadcnDropdownMenuContent align="end" class="min-w-40">
                <ShadcnDropdownMenuItem class="py-2" @click="emit('openFileFromDisk')">
                  <FileUp class="mr-2 size-4" />
                  {{ t('openFile') }}
                </ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuItem class="py-2" @click="emit('openFolder')">
                  <FolderOpen class="mr-2 size-4" />
                  {{ t('openFolder') }}
                </ShadcnDropdownMenuItem>
              </ShadcnDropdownMenuContent>
            </ShadcnDropdownMenu>
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
              <FileTreeNode :entry="entry" @select="emit('selectEntry', $event)" @toggle="emit('toggleEntry', $event)" />
            </div>
          </template>
          <div v-else class="flex flex-col items-center gap-3 p-6 text-center text-muted-foreground">
            <FolderOpen class="size-10 opacity-50" />
            <p class="text-xs">{{ t("noFolder") }}</p>
            <button
              class="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
              @click="emit('openFolder')"
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
              @close="emit('closeTab', $event)"
              @reorder="(from: number, to: number) => editorStore.moveTab(from, to)"
              @new-file="emit('newFile')"
            />

            <!-- Editor Content -->
            <div class="flex-1">
              <template v-if="editorStore.activeTab">
                <MonacoEditor
                  :tab="editorStore.activeTab"
                  @update:content="(content) => editorStore.updateTabContent(editorStore.activeTabId!, content)"
                  @save="emit('save')"
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
        @click="emit('openSettings')"
      >
        <Settings class="size-3.5" />
      </button>
    </div>
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
  terminal: Terminal
  settings: Settings
</i18n>

<style>
/* Make splitpane splitters grabbable */
.splitpanes--horizontal > .splitpanes__splitter {
  height: 4px;
  min-height: 4px;
  background: hsl(var(--border));
  cursor: row-resize;
  transition: background 0.15s;
}
.splitpanes--horizontal > .splitpanes__splitter:hover {
  background: hsl(var(--primary));
}
.splitpanes--vertical > .splitpanes__splitter {
  width: 4px;
  min-width: 4px;
  background: hsl(var(--border));
  cursor: col-resize;
  transition: background 0.15s;
}
.splitpanes--vertical > .splitpanes__splitter:hover {
  background: hsl(var(--primary));
}
</style>
