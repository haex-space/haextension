<template>
  <ShadcnInputGroup>
    <ShadcnInputGroupInput
      v-model="model"
      v-bind="$attrs"
    />
    <ShadcnInputGroupButton
      v-if="copyable"
      :icon="copied ? Check : Copy"
      :tooltip="copied ? t('copied') : t('copy')"
      variant="ghost"
      @click.prevent="handleCopy"
    />
  </ShadcnInputGroup>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Copy, Check } from "lucide-vue-next";

defineProps<{
  copyable?: boolean;
}>();

const model = defineModel<string | number | null>();

const { t } = useI18n();
const { copy, copied } = useClipboard();

const handleCopy = async () => {
  if (model.value) {
    await copy(String(model.value));
  }
};
</script>

<i18n lang="yaml">
de:
  copy: Kopieren
  copied: Kopiert!

en:
  copy: Copy
  copied: Copied!
</i18n>
