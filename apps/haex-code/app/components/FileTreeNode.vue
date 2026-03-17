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
      class="flex w-full items-center gap-1 py-0.5 pr-2 text-left text-xs hover:bg-accent"
      :style="{ paddingLeft: `${entry.depth * 16 + 8}px` }"
      @click="handleClick"
    >
      <template v-if="entry.isDirectory">
        <ChevronDown v-if="entry.isExpanded" class="size-3.5 shrink-0 text-muted-foreground" />
        <ChevronRight v-else class="size-3.5 shrink-0 text-muted-foreground" />
        <FolderOpen v-if="entry.isExpanded" class="size-3.5 shrink-0 text-primary" />
        <Folder v-else class="size-3.5 shrink-0 text-primary" />
      </template>
      <template v-else>
        <span class="size-3.5 shrink-0" />
        <File class="size-3.5 shrink-0 text-muted-foreground" />
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
