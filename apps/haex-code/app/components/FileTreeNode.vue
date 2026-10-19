<script setup lang="ts">
import { ChevronRight, ChevronDown } from "@lucide/vue";
import type { FileEntry } from "~/types";
import { GIT_STATUS_COLOR, GIT_STATUS_LABEL } from "~/lib/gitStatus";

const props = defineProps<{
  entry: FileEntry;
}>();

const gitStore = useGitStore();
const workspace = useWorkspaceStore();

const gitStatus = computed(() => {
  if (!workspace.rootPath || props.entry.isDirectory) return null;
  return gitStore.getFileStatus(props.entry.path, workspace.rootPath);
});

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
      <span class="flex-1 truncate" :class="gitStatus ? GIT_STATUS_COLOR[gitStatus] : ''">{{ entry.name }}</span>
      <span v-if="gitStatus" class="shrink-0 font-mono text-xs" :class="GIT_STATUS_COLOR[gitStatus]">
        {{ GIT_STATUS_LABEL[gitStatus] }}
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
