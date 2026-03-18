<script setup lang="ts">
import { ChevronRight, ChevronDown } from "lucide-vue-next";
import type { FileEntry } from "~/types";

const props = defineProps<{
  entry: FileEntry;
}>();

const gitStore = useGitStore();
const workspace = useWorkspaceStore();

const gitStatus = computed(() => {
  if (!workspace.rootPath || props.entry.isDirectory) return null;
  return gitStore.getFileStatus(props.entry.path, workspace.rootPath);
});

const gitColor: Record<string, string> = {
  modified: "text-yellow-500",
  deleted: "text-red-500",
  untracked: "text-green-500",
  "staged-added": "text-green-500",
  "staged-modified": "text-yellow-500",
  "staged-deleted": "text-red-500",
  staged: "text-yellow-500",
};

const gitLabel: Record<string, string> = {
  modified: "M", deleted: "D", untracked: "U",
  "staged-added": "A", "staged-modified": "M", "staged-deleted": "D", staged: "M",
};

const emit = defineEmits<{
  select: [entry: FileEntry];
  toggle: [entry: FileEntry];
}>();

const settings = useSettingsStore();
const { getFileIcon } = useFileIcon();

const handleClick = () => {
  if (props.entry.isDirectory) {
    emit("toggle", props.entry);
  } else {
    emit("select", props.entry);
  }
};
</script>

<template>
  <div>
    <button
      class="flex w-full items-center gap-1.5 pr-2 text-left hover:bg-accent"
      :class="[settings.scale.fontSize, settings.scale.rowPadding, settings.scale.lineHeight]"
      :style="{ paddingLeft: `${entry.depth * settings.scale.indent + 8}px` }"
      @click="handleClick"
    >
      <template v-if="entry.isDirectory">
        <ChevronDown v-if="entry.isExpanded" class="shrink-0 text-muted-foreground" :class="settings.scale.iconSize" />
        <ChevronRight v-else class="shrink-0 text-muted-foreground" :class="settings.scale.iconSize" />
      </template>
      <template v-else>
        <span class="shrink-0" :class="settings.scale.iconSize" />
        <Icon :name="getFileIcon(entry.name)" :class="settings.scale.iconSize" class="shrink-0" />
      </template>
      <span class="flex-1 truncate" :class="gitStatus ? gitColor[gitStatus] : ''">{{ entry.name }}</span>
      <span v-if="gitStatus" class="shrink-0 font-mono text-xs" :class="gitColor[gitStatus]">
        {{ gitLabel[gitStatus] }}
      </span>
    </button>

    <template v-if="entry.isDirectory && entry.isExpanded && entry.children">
      <FileTreeNode
        v-for="child in entry.children"
        :key="child.path"
        :entry="child"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </template>
  </div>
</template>
