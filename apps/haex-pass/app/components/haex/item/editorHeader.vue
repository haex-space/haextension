<template>
  <div
    class="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center gap-4"
  >
    <!-- Tab Navigation -->
    <div class="flex-1 flex justify-center">
      <div
        class="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
      >
        <button
          v-for="(tab, index) in tabs"
          :key="tab.value"
          type="button"
          :class="[
            'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
            activeTab === index
              ? 'bg-background text-foreground shadow'
              : 'hover:bg-background/50',
          ]"
          @click="$emit('selectTab', index)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Header Actions -->
    <div class="flex gap-2 items-center">
      <!-- Delete Button (only in edit mode) -->
      <UiButton
        v-if="mode === 'edit'"
        :icon="Trash2"
        :title="t('delete')"
        variant="destructive"
        @click="$emit('delete')"
      >
        <span class="hidden sm:inline">{{ t("delete") }}</span>
      </UiButton>

      <!-- Edit Button (only in edit mode when readOnly) -->
      <UiButton
        v-if="mode === 'edit' && readOnly"
        :icon="Pencil"
        :title="t('edit')"
        variant="default"
        @click="$emit('edit')"
      >
        <span class="hidden sm:inline">{{ t("edit") }}</span>
      </UiButton>

      <!-- Save Button -->
      <UiButton
        v-if="mode === 'create' || !readOnly"
        :icon="Save"
        :disabled="!hasChanges"
        :class="{ 'animate-pulse': hasChanges }"
        :title="t('save')"
        @click="$emit('save')"
      >
        <span class="hidden sm:inline">{{ t("save") }}</span>
      </UiButton>

      <!-- Close Button -->
      <UiButton
        :icon="X"
        :title="t('cancel')"
        variant="ghost"
        @click="$emit('close')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { X, Trash2, Pencil, Save } from "@lucide/vue";

defineProps<{
  tabs: { label: string; value: string }[];
  activeTab: number;
  mode: "create" | "edit";
  readOnly: boolean;
  hasChanges: boolean;
}>();

defineEmits<{
  selectTab: [index: number];
  delete: [];
  edit: [];
  save: [];
  close: [];
}>();

const { t } = useI18n();
</script>

<i18n lang="yaml">
de:
  edit: Bearbeiten
  save: Speichern
  cancel: Abbrechen
  delete: Löschen

en:
  edit: Edit
  save: Save
  cancel: Cancel
  delete: Delete
</i18n>
