<script setup lang="ts">
import { GripVertical, Trash2 } from "lucide-vue-next";
import { makeDraggable } from "@vue-dnd-kit/core";
import type { IPlacement } from "@vue-dnd-kit/core";
import type { SelectPage } from "~/database/schemas";

const props = defineProps<{
  page: SelectPage;
  index: number;
  items: SelectPage[];
  isActive: boolean;
  canDelete: boolean;
  templateLabel: string;
}>();

const emit = defineEmits<{
  select: [];
  delete: [];
}>();

const itemRef = useTemplateRef<HTMLElement>("itemRef");

const { isDragging, isDragOver } = makeDraggable(itemRef, {
  dragHandle: ".drag-handle",
}, () => [
  props.index,
  props.items,
]);

const placement = computed<IPlacement | undefined>(() => isDragOver.value);
</script>

<template>
  <div
    ref="itemRef"
    class="relative mb-1 flex items-center gap-1 rounded-lg border p-1.5 transition-all"
    :class="[
      isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30',
      isDragging ? 'opacity-30' : '',
    ]"
  >
    <!-- Drop indicators -->
    <div v-if="placement?.top" class="absolute -top-1 left-2 right-2 h-0.5 rounded-full bg-primary" />
    <div v-if="placement?.bottom" class="absolute -bottom-1 left-2 right-2 h-0.5 rounded-full bg-primary" />

    <!-- Drag handle (touch-action: none only here so list stays scrollable) -->
    <GripVertical class="drag-handle size-4 shrink-0 cursor-grab touch-none select-none text-muted-foreground/50 active:cursor-grabbing" />

    <!-- Page info (clickable) -->
    <button
      class="min-w-0 flex-1 text-left"
      @click="emit('select')"
    >
      <div class="text-xs font-medium text-foreground">Seite {{ index + 1 }}</div>
      <div class="text-[10px] text-muted-foreground truncate">{{ templateLabel }}</div>
    </button>

    <!-- Delete -->
    <button
      v-if="canDelete"
      class="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
      @click.stop="emit('delete')"
    >
      <Trash2 class="size-3.5" />
    </button>
  </div>
</template>
