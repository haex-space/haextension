<script setup lang="ts">
import { FolderOpen, GitCommit } from "@lucide/vue";
import type { FileEntry } from "~/types";

const props = defineProps<{
  /** Larger touch targets for the mobile sheet. */
  touch?: boolean;
}>();

const emit = defineEmits<{
  selectEntry: [entry: FileEntry];
  toggleEntry: [entry: FileEntry];
  openFolder: [];
}>();

const sidebarTab = defineModel<"explorer" | "git">("sidebarTab", { required: true });

const { t } = useI18n();
const workspace = useWorkspaceStore();
const gitStore = useGitStore();

const sizes = computed(() =>
  props.touch
    ? {
        tab: "gap-1.5 py-3 text-sm",
        tabIcon: "size-4",
        badge: "px-1.5 text-xs",
        empty: "gap-4 p-8",
        emptyIcon: "size-12",
        emptyText: "text-sm",
        button: "px-4 py-2.5 text-sm active:bg-primary/80",
      }
    : {
        tab: "gap-1 py-2 text-xs",
        tabIcon: "size-3.5",
        badge: "px-1 text-[10px]",
        empty: "gap-3 p-6",
        emptyIcon: "size-10",
        emptyText: "text-xs",
        button: "px-3 py-1.5 text-xs hover:bg-primary/90",
      }
);

const tabClass = (tab: "explorer" | "git") =>
  sidebarTab.value === tab ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground";
</script>

<template>
  <div class="flex border-b border-border">
    <button
      class="flex flex-1 items-center justify-center"
      :class="[sizes.tab, tabClass('explorer')]"
      @click="sidebarTab = 'explorer'"
    >
      <FolderOpen :class="sizes.tabIcon" />
      {{ t("explorer") }}
    </button>
    <button
      class="flex flex-1 items-center justify-center"
      :class="[sizes.tab, tabClass('git')]"
      @click="sidebarTab = 'git'"
    >
      <GitCommit :class="sizes.tabIcon" />
      {{ t("sourceControl") }}
      <span v-if="gitStore.files.length > 0" class="rounded-full bg-primary text-primary-foreground" :class="sizes.badge">
        {{ gitStore.files.length }}
      </span>
    </button>
  </div>

  <ShadcnScrollArea v-if="sidebarTab === 'explorer'" class="flex-1 text-sm">
    <template v-if="workspace.rootPath">
      <div v-for="entry in workspace.fileTree" :key="entry.path">
        <FileTreeNode :entry="entry" @select="emit('selectEntry', $event)" @toggle="emit('toggleEntry', $event)" />
      </div>
    </template>
    <div v-else class="flex flex-col items-center text-center text-muted-foreground" :class="sizes.empty">
      <FolderOpen class="opacity-50" :class="sizes.emptyIcon" />
      <p :class="sizes.emptyText">{{ t("noFolder") }}</p>
      <button class="rounded-md bg-primary text-primary-foreground" :class="sizes.button" @click="emit('openFolder')">
        {{ t("openFolder") }}
      </button>
    </div>
  </ShadcnScrollArea>

  <GitPanel v-else-if="sidebarTab === 'git'" />
</template>

<i18n lang="yaml">
de:
  explorer: Explorer
  sourceControl: Quellcodeverwaltung
  noFolder: Kein Ordner geöffnet
  openFolder: Ordner öffnen
en:
  explorer: Explorer
  sourceControl: Source Control
  noFolder: No folder opened
  openFolder: Open Folder
</i18n>
