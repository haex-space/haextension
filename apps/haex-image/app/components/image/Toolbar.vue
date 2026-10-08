<script setup lang="ts">
import {
  ImagePlus, Undo2, Redo2, Crop, RotateCw,
  Maximize2, SlidersHorizontal, Sparkles, Save, Menu, Archive,
} from "@lucide/vue";
import type { EditorTool } from "~/types";

const emit = defineEmits<{
  open: [];
  save: [];
}>();

const { t } = useI18n();
const editor = useEditorStore();

const toolButtons = computed(() => [
  { id: "crop", icon: Crop, label: t("crop") },
  { id: "rotate", icon: RotateCw, label: t("rotate") },
  { id: "resize", icon: Maximize2, label: t("resize") },
  { id: "adjust", icon: SlidersHorizontal, label: t("adjust") },
  { id: "filter", icon: Sparkles, label: t("filter") },
  { id: "compress", icon: Archive, label: t("compress") },
]);

function selectTool(id: string) {
  editor.activeTool = editor.activeTool === id ? null : id as EditorTool;
}
</script>

<template>
  <header class="flex items-center gap-1 border-b border-border px-2 py-1.5">
    <!-- Open -->
    <button
      class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      :title="t('open')"
      @click="emit('open')"
    >
      <ImagePlus class="size-4" />
      <span class="hidden md:inline">{{ t("open") }}</span>
    </button>

    <div class="mx-1 h-5 w-px bg-border" />

    <!-- Undo/Redo -->
    <button
      class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
      :disabled="!editor.canUndo"
      :title="t('undo')"
      @click="editor.undo()"
    >
      <Undo2 class="size-4" />
    </button>
    <button
      class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
      :disabled="!editor.canRedo"
      :title="t('redo')"
      @click="editor.redo()"
    >
      <Redo2 class="size-4" />
    </button>

    <template v-if="editor.hasImage">
      <div class="mx-1 h-5 w-px bg-border" />

      <!-- Tools (large screens) -->
      <div class="hidden gap-1 lg:flex">
        <button
          v-for="tool in toolButtons"
          :key="tool.id"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
          :class="editor.activeTool === tool.id
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
          @click="selectTool(tool.id)"
        >
          <component :is="tool.icon" class="size-4" />
          {{ tool.label }}
        </button>
      </div>

      <!-- Tools burger (small screens) -->
      <ShadcnDropdownMenu>
        <ShadcnDropdownMenuTrigger as-child>
          <button
            class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu class="size-4" />
            <span>{{ t("tools") }}</span>
          </button>
        </ShadcnDropdownMenuTrigger>
        <ShadcnDropdownMenuContent align="start" class="min-w-40">
          <ShadcnDropdownMenuItem
            v-for="tool in toolButtons"
            :key="tool.id"
            @click="selectTool(tool.id)"
          >
            <component :is="tool.icon" class="mr-2 size-4" />
            {{ tool.label }}
          </ShadcnDropdownMenuItem>
        </ShadcnDropdownMenuContent>
      </ShadcnDropdownMenu>
    </template>

    <div class="flex-1" />

    <!-- Info -->
    <span v-if="editor.hasImage" class="hidden text-xs text-muted-foreground md:inline">
      {{ editor.imageWidth }} × {{ editor.imageHeight }}px
    </span>

    <!-- Save -->
    <button
      v-if="editor.hasImage"
      class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      :title="t('saveAs')"
      @click="emit('save')"
    >
      <Save class="size-4" />
      <span class="hidden md:inline">{{ t("save") }}</span>
    </button>
  </header>
</template>

<i18n lang="yaml">
de:
  open: Öffnen
  save: Speichern
  undo: Rückgängig
  redo: Wiederholen
  tools: Werkzeuge
  crop: Zuschneiden
  rotate: Drehen
  resize: Größe
  adjust: Anpassen
  filter: Filter
  compress: Komprimieren
  saveAs: Speichern unter
en:
  open: Open
  save: Save
  undo: Undo
  redo: Redo
  tools: Tools
  crop: Crop
  rotate: Rotate
  resize: Resize
  adjust: Adjust
  filter: Filter
  compress: Compress
  saveAs: Save As
</i18n>
