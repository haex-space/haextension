<script setup lang="ts">
import { FileCode2, Plus, X } from "lucide-vue-next";
import type { EditorTab } from "~/types";

const props = defineProps<{
  tabs: EditorTab[];
  activeTabId: string | null;
}>();

const emit = defineEmits<{
  select: [tabId: string];
  close: [tabId: string];
  reorder: [fromIndex: number, toIndex: number];
  newFile: [];
}>();

const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);

const onDragStart = (e: DragEvent, index: number) => {
  dragIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }
};

const onDragOver = (e: DragEvent, index: number) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  overIndex.value = index;
};

const onDrop = (e: DragEvent, index: number) => {
  e.preventDefault();
  if (dragIndex.value !== null && dragIndex.value !== index) {
    emit("reorder", dragIndex.value, index);
  }
  dragIndex.value = null;
  overIndex.value = null;
};

const onDragEnd = () => {
  dragIndex.value = null;
  overIndex.value = null;
};
</script>

<template>
  <div class="flex items-center border-b border-border bg-background">
    <div class="flex flex-1 overflow-x-auto">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        draggable="true"
        class="group flex cursor-grab select-none items-center gap-2 border-r border-border px-4 py-2 text-sm transition-colors active:cursor-grabbing"
        :class="[
          tab.id === activeTabId
            ? 'bg-card text-foreground'
            : 'bg-background text-muted-foreground hover:bg-accent',
          dragIndex === index ? 'opacity-30' : '',
          overIndex === index && dragIndex !== index ? 'border-l-2 border-l-primary' : '',
        ]"
        @click="emit('select', tab.id)"
        @dragstart="onDragStart($event, index)"
        @dragover="onDragOver($event, index)"
        @drop="onDrop($event, index)"
        @dragend="onDragEnd"
        @dragleave="overIndex === index && (overIndex = null)"
      >
        <FileCode2 class="size-4 shrink-0" />
        <span class="whitespace-nowrap">{{ tab.name }}</span>
        <span v-if="tab.isDirty" class="size-2 shrink-0 rounded-full bg-primary" />
        <button
          class="ml-1 shrink-0 rounded-md p-1 opacity-0 hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
          @click.stop="emit('close', tab.id)"
        >
          <X class="size-4" />
        </button>
      </div>
    </div>
    <button
      class="shrink-0 rounded-md p-2 text-primary hover:bg-primary/10 active:bg-primary/20"
      title="New File"
      @click="emit('newFile')"
    >
      <Plus class="size-4" />
    </button>
  </div>
</template>
