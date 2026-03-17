<script setup lang="ts">
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
} from "lucide-vue-next";
import type { FileEntry } from "~/types";

const props = defineProps<{
  entry: FileEntry;
}>();

const emit = defineEmits<{
  select: [entry: FileEntry];
  toggle: [entry: FileEntry];
}>();

const settings = useSettingsStore();

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
        <File class="shrink-0 text-muted-foreground" :class="settings.scale.iconSize" />
      </template>
      <span class="truncate">{{ entry.name }}</span>
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
