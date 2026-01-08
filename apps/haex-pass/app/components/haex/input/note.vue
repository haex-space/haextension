<template>
  <div class="space-y-2">
    <ShadcnLabel>{{ t("note") }}</ShadcnLabel>
    <UiTextarea
      :model-value="model ?? undefined"
      :placeholder="t('note')"
      :readonly="readonly"
      rows="4"
      with-copy
      v-bind="$attrs"
      @update:model-value="model = String($event) || null"
    />
  </div>
</template>

<script setup lang="ts">
const model = defineModel<string | null>();

defineProps<{
  readonly?: boolean;
}>();

const { t } = useI18n();
</script>

<i18n lang="yaml">
de:
  note: Notiz
en:
  note: Note
</i18n>
