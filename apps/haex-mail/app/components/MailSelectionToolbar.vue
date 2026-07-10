<script setup lang="ts">
import {
  Archive,
  FolderInput,
  Mail,
  MailOpen,
  Trash2,
  X,
} from "lucide-vue-next";

defineProps<{
  /** Move needs a single source account — disabled across accounts. */
  canMove: boolean;
}>();

defineEmits<{
  markRead: [];
  markUnread: [];
  archive: [];
  move: [];
  delete: [];
}>();

const selectionStore = useSelectionStore();
</script>

<template>
  <div
    class="shrink-0 bg-primary text-primary-foreground border-b border-border px-2 h-12 md:h-12 flex items-center justify-between gap-1"
  >
    <div class="flex items-center gap-1 min-w-0">
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="X"
        tooltip="Auswahl aufheben"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="selectionStore.clearSelection()"
      />
      <span class="font-medium text-sm truncate">
        {{ selectionStore.selectedCount }} ausgewählt
      </span>
    </div>
    <div class="flex items-center">
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="MailOpen"
        tooltip="Als gelesen markieren"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('markRead')"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="Mail"
        tooltip="Als ungelesen markieren"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('markUnread')"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="Archive"
        tooltip="Archivieren"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('archive')"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="FolderInput"
        :disabled="!canMove"
        :tooltip="canMove ? 'In Ordner verschieben' : 'Auswahl umfasst mehrere Konten'"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('move')"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="Trash2"
        tooltip="Löschen"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('delete')"
      />
    </div>
  </div>
</template>
