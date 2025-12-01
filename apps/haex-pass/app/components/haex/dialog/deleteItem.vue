<template>
  <UiDialogConfirm
    v-model:open="isOpen"
    :title="final ? t('final.title') : t('title')"
    :description="final ? t('final.description', { name: itemName }) : t('description', { name: itemName })"
    :confirm-label="final ? t('final.confirm') : t('confirm')"
    :abort-label="t('abort')"
    @confirm="$emit('confirm')"
    @abort="$emit('abort')"
  />
</template>

<script setup lang="ts">
defineProps<{
  itemName?: string;
  final?: boolean;
}>();

defineEmits<{
  confirm: [];
  abort: [];
}>();

const isOpen = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
</script>

<i18n lang="yaml">
de:
  title: In Papierkorb verschieben?
  description: "Möchten Sie \"{name}\" in den Papierkorb verschieben?"
  confirm: In Papierkorb verschieben
  abort: Abbrechen
  final:
    title: Endgültig löschen?
    description: "Möchten Sie \"{name}\" endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden."
    confirm: Endgültig löschen

en:
  title: Move to Trash?
  description: "Do you want to move \"{name}\" to trash?"
  confirm: Move to Trash
  abort: Cancel
  final:
    title: Permanently Delete?
    description: "Do you want to permanently delete \"{name}\"? This action cannot be undone."
    confirm: Permanently Delete
</i18n>
