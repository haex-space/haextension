<script setup lang="ts">
const { t } = useI18n();

defineProps<{
  fileName: string;
}>();

const emit = defineEmits<{
  save: [];
  discard: [];
  cancel: [];
}>();
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('cancel')">
    <div class="w-80 rounded-lg border border-border bg-background p-4 shadow-lg">
      <h3 class="mb-2 text-sm font-semibold">{{ t('title') }}</h3>
      <p class="mb-4 text-sm text-muted-foreground">
        {{ t('message', { name: fileName }) }}
      </p>
      <div class="flex justify-end gap-2">
        <button
          class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          @click="emit('cancel')"
        >
          {{ t('cancel') }}
        </button>
        <button
          class="rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          @click="emit('discard')"
        >
          {{ t('discard') }}
        </button>
        <button
          class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          @click="emit('save')"
        >
          {{ t('save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  title: Ungespeicherte Änderungen
  message: "{name} hat ungespeicherte Änderungen. Möchtest du sie speichern?"
  save: Speichern
  discard: Verwerfen
  cancel: Abbrechen
en:
  title: Unsaved Changes
  message: "{name} has unsaved changes. Do you want to save them?"
  save: Save
  discard: Discard
  cancel: Cancel
</i18n>
