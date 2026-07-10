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

const { t } = useI18n();
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
        :tooltip="t('clear')"
        :aria-label="t('clear')"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="selectionStore.clearSelection()"
      />
      <span class="font-medium text-sm truncate">
        {{ t("selected", { count: selectionStore.selectedCount }) }}
      </span>
    </div>
    <div class="flex items-center">
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="MailOpen"
        :tooltip="t('markRead')"
        :aria-label="t('markRead')"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('markRead')"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="Mail"
        :tooltip="t('markUnread')"
        :aria-label="t('markUnread')"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('markUnread')"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="Archive"
        :tooltip="t('archive')"
        :aria-label="t('archive')"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('archive')"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="FolderInput"
        :disabled="!canMove"
        :tooltip="canMove ? t('move') : t('moveDisabled')"
        :aria-label="canMove ? t('move') : t('moveDisabled')"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('move')"
      />
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="Trash2"
        :tooltip="t('delete')"
        :aria-label="t('delete')"
        class="text-primary-foreground hover:bg-primary-foreground/10"
        @click="$emit('delete')"
      />
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  selected: "{count} ausgewählt"
  clear: Auswahl aufheben
  markRead: Als gelesen markieren
  markUnread: Als ungelesen markieren
  archive: Archivieren
  move: In Ordner verschieben
  moveDisabled: Auswahl umfasst mehrere Konten
  delete: Löschen
en:
  selected: "{count} selected"
  clear: Clear selection
  markRead: Mark as read
  markUnread: Mark as unread
  archive: Archive
  move: Move to folder
  moveDisabled: Selection spans multiple accounts
  delete: Delete
</i18n>
