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
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <ShadcnButton variant="outline" @click="emit('cancel')">
            {{ t('cancel') }}
          </ShadcnButton>
          <ShadcnButton variant="destructive" @click="emit('discard')">
            {{ t('discard') }}
          </ShadcnButton>
        </div>
        <ShadcnButton @click="emit('save')">
          {{ t('save') }}
        </ShadcnButton>
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
