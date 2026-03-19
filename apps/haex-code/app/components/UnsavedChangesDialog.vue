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
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="emit('cancel')">
    <div class="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl">
      <h3 class="mb-3 text-base font-semibold">{{ t('title') }}</h3>
      <p class="mb-6 text-sm leading-relaxed text-muted-foreground">
        {{ t('message', { name: fileName }) }}
      </p>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          class="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent active:bg-accent/70"
          @click="emit('cancel')"
        >
          {{ t('cancel') }}
        </button>
        <button
          class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 active:bg-destructive/30"
          @click="emit('discard')"
        >
          {{ t('discard') }}
        </button>
        <button
          class="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
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
