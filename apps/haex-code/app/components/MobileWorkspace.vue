<script setup lang="ts">
import {
  Plus,
  FolderOpen,
  X,
  Terminal as TerminalIcon,
  FileCode2,
  ChevronDown as ChevronDownIcon,
  Settings,
  GitCommit,
  PanelLeftOpen,
  FileUp,
  Menu,
} from "@lucide/vue";
import type { FileEntry } from "~/types";

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

const { t } = useI18n();
const workspace = useWorkspaceStore();
const editorStore = useEditorStore();
const terminalStore = useTerminalStore();
const gitStore = useGitStore();
</script>

<template>
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
        @click="emit('openSettings')"
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
      @close="emit('closeTab', $event)"
      @reorder="(from: number, to: number) => editorStore.moveTab(from, to)"
      @new-file="emit('newFile')"
    />

    <!-- Editor Content -->
    <div class="flex-1 min-h-0">
      <template v-if="editorStore.activeTab">
        <MonacoEditor
          :tab="editorStore.activeTab"
          @update:content="(content) => editorStore.updateTabContent(editorStore.activeTabId!, content)"
          @save="emit('save')"
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
            <ShadcnDropdownMenu>
              <ShadcnDropdownMenuTrigger as-child>
                <button class="rounded-md p-2.5 text-muted-foreground hover:bg-accent active:bg-accent/70">
                  <Menu class="size-5" />
                </button>
              </ShadcnDropdownMenuTrigger>
              <ShadcnDropdownMenuContent align="end" class="min-w-44">
                <ShadcnDropdownMenuItem class="py-3 text-sm" @click="emit('openFileFromDisk')">
                  <FileUp class="mr-2 size-5" />
                  {{ t('openFile') }}
                </ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuItem class="py-3 text-sm" @click="emit('openFolder')">
                  <FolderOpen class="mr-2 size-5" />
                  {{ t('openFolder') }}
                </ShadcnDropdownMenuItem>
              </ShadcnDropdownMenuContent>
            </ShadcnDropdownMenu>
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
              <FileTreeNode :entry="entry" @select="emit('selectEntry', $event)" @toggle="emit('toggleEntry', $event)" />
            </div>
          </template>
          <div v-else class="flex flex-col items-center gap-4 p-8 text-center text-muted-foreground">
            <FolderOpen class="size-12 opacity-50" />
            <p class="text-sm">{{ t("noFolder") }}</p>
            <button
              class="rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground active:bg-primary/80"
              @click="emit('openFolder')"
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

<i18n lang="yaml">
de:
  explorer: Explorer
  openFile: Datei öffnen
  openFolder: Ordner öffnen
  noFolder: Kein Ordner geöffnet
  openFileToEdit: Datei öffnen zum Bearbeiten
  terminal: Terminal
en:
  explorer: Explorer
  openFile: Open File
  openFolder: Open Folder
  noFolder: No folder opened
  openFileToEdit: Open a file to start editing
  terminal: Terminal
</i18n>
