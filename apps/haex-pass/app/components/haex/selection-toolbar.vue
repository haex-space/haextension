<template>
  <div
    v-if="selectionStore.isSelectionMode"
    ref="toolbarRef"
    class="sticky top-0 z-20 bg-primary text-primary-foreground border-b border-border px-5 py-4"
  >
    <div class="flex items-center justify-between min-h-[32px]">
      <div class="flex items-center gap-3">
        <UiButton
          variant="ghost"
          :icon="X"
          class="text-primary-foreground hover:bg-primary-foreground/10"
          @click="selectionStore.clearSelection()"
        />
        <span class="font-medium">
          {{ t("selected", { count: selectionStore.selectedCount }) }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Normal selection mode buttons -->
        <template v-if="!selectionStore.hasClipboardItems">
          <!-- Edit button - only visible when exactly 1 item is selected -->
          <UiButton
            v-if="selectionStore.selectedCount === 1"
            variant="ghost"
            :icon="Pencil"
            :tooltip="t('edit')"
            class="text-primary-foreground hover:bg-primary-foreground/10"
            @click="$emit('edit')"
          />

          <!-- Copy button - visible when 1 or more items selected -->
          <UiButton
            variant="ghost"
            :icon="Copy"
            :tooltip="t('copy')"
            class="text-primary-foreground hover:bg-primary-foreground/10"
            @click="$emit('copy')"
          />

          <!-- Cut button - visible when 1 or more items selected -->
          <UiButton
            variant="ghost"
            :icon="Scissors"
            :tooltip="t('cut')"
            class="text-primary-foreground hover:bg-primary-foreground/10"
            @click="$emit('cut')"
          />

          <!-- Restore button - only visible when in trash -->
          <UiButton
            v-if="isInTrash"
            variant="ghost"
            :icon="RotateCcw"
            :tooltip="t('restore')"
            class="text-primary-foreground hover:bg-primary-foreground/10"
            @click="$emit('restore')"
          />

          <!-- Delete button - always visible -->
          <UiButton
            variant="ghost"
            :icon="Trash2"
            :tooltip="t('delete')"
            class="text-primary-foreground hover:bg-primary-foreground/10"
            @click="$emit('delete')"
          />
        </template>

        <!-- Clipboard mode buttons -->
        <template v-else>
          <!-- Paste button -->
          <UiButton
            variant="ghost"
            :icon="ClipboardPaste"
            :tooltip="t('paste')"
            class="text-primary-foreground hover:bg-primary-foreground/10"
            @click="$emit('paste')"
          />

          <!-- Cancel clipboard button -->

          <UiButton
            variant="ghost"
            :icon="XCircle"
            :tooltip="t('cancel')"
            class="text-primary-foreground hover:bg-primary-foreground/10"
            @click="selectionStore.clearClipboard()"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  X,
  Pencil,
  Copy,
  Scissors,
  Trash2,
  XCircle,
  ClipboardPaste,
  RotateCcw,
} from "lucide-vue-next";

defineProps<{
  isInTrash?: boolean;
}>();

const { t } = useI18n();
const selectionStore = useSelectionStore();

defineEmits<{
  edit: [];
  copy: [];
  cut: [];
  delete: [];
  paste: [];
  restore: [];
}>();
</script>

<i18n lang="yaml">
de:
  selected: "{count} ausgewählt"
  edit: Bearbeiten
  copy: Kopieren
  cut: Ausschneiden
  delete: Löschen
  restore: Wiederherstellen
  deselectAll: Alle abwählen
  paste: Einfügen
  cancel: Abbrechen

en:
  selected: "{count} selected"
  edit: Edit
  copy: Copy
  cut: Cut
  delete: Delete
  restore: Restore
  deselectAll: Deselect all
  paste: Paste
  cancel: Cancel
</i18n>
