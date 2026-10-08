<script setup lang="ts">
import {
  Hand,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Save,
  History,
  Camera,
  Images,
  Smile,
} from "@lucide/vue";
import type { Tool } from "~/types";

defineProps<{
  historyVisible: boolean;
  galleryVisible: boolean;
  galleryThumbnail: string | null;
}>();

const emit = defineEmits<{
  save: [];
  exportPng: [];
  toggleHistory: [];
  toggleCamera: [];
  toggleGallery: [];
  toggleEmoji: [];
}>();

const { t } = useI18n();
const canvas = useCanvasStore();

const tools: { id: Tool; icon: any; label: string; shortcut: string }[] = [
  { id: "pan", icon: Hand, label: "pan", shortcut: "H" },
];
</script>

<template>
  <!-- Vertical left toolbar -->
  <div class="flex shrink-0">
    <div class="flex flex-col items-center gap-0.5 border-r border-border bg-background px-1 py-2">
      <!-- Burger Menu -->
      <DrawToolbarMainMenu />

      <!-- Separator -->
      <div class="my-1 h-px w-6 bg-border" />
      <!-- Unified Brush Menu: Preset + Tip + Size + Color -->
      <DrawToolbarBrushMenu />

      <!-- Other Tools (Eraser, Pan) -->
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="rounded-lg p-2 transition-colors"
        :class="canvas.activeTool === tool.id
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
        :title="`${t(tool.label)} (${tool.shortcut})`"
        @click="canvas.activeTool = tool.id"
      >
        <component :is="tool.icon" class="size-6" />
      </button>

      <!-- Separator -->
      <div class="my-1 h-px w-6 bg-border" />

      <!-- Stencils -->
      <DrawToolbarStencilMenu />

      <!-- Camera -->
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        :title="t('camera')"
        @click="emit('toggleCamera')"
      >
        <Camera class="size-6" />
      </button>

      <!-- Gallery -->
      <button
        class="rounded-lg p-2 transition-colors"
        :class="galleryVisible
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
        :title="t('gallery')"
        @click="emit('toggleGallery')"
      >
        <img
          v-if="galleryThumbnail"
          :src="galleryThumbnail"
          class="size-6 rounded object-cover"
        />
        <Images v-else class="size-6" />
      </button>

      <!-- Emoji -->
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        :title="t('emoji')"
        @click="emit('toggleEmoji')"
      >
        <Smile class="size-6" />
      </button>

      <!-- Separator -->
      <div class="my-1 h-px w-6 bg-border" />

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Actions at bottom -->
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        :title="t('save')"
        @click="emit('save')"
      >
        <Save class="size-6" />
      </button>
      <button
        class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        :title="t('exportPng')"
        @click="emit('exportPng')"
      >
        <Download class="size-6" />
      </button>
      <button
        class="rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10"
        :title="t('clear')"
        @click="canvas.clear()"
      >
        <Trash2 class="size-6" />
      </button>
    </div>
  </div>

</template>

<i18n lang="yaml">
de:
  brushPreset: Stift
  tip: Spitze
  eraser: Radierer
  pan: Verschieben
  camera: Kamera
  gallery: Galerie
  emoji: Emoji
  undo: Rückgängig
  redo: Wiederherstellen
  history: Verlauf
  save: Speichern
  exportPng: Als PNG exportieren
  clear: Alles löschen
en:
  brushPreset: Brush
  tip: Tip
  eraser: Eraser
  pan: Pan
  camera: Camera
  gallery: Gallery
  emoji: Emoji
  undo: Undo
  redo: Redo
  history: History
  save: Save
  exportPng: Export as PNG
  clear: Clear all
</i18n>
