<template>
  <div class="space-y-2">
    <ShadcnLabel>{{ t('note') }}</ShadcnLabel>
    <div class="relative">
      <ShadcnTextarea
        v-model="model"
        :placeholder="t('note')"
        :readonly="readonly"
        rows="4"
        class="pr-12"
        v-bind="$attrs"
      />
      <ShadcnButton
        :icon="copied ? Check : Copy"
        variant="ghost"
        size="icon-sm"
        class="absolute top-2 right-2"
        @click.prevent="handleCopy"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Copy, Check } from "lucide-vue-next";

const model = defineModel<string | null>();

defineProps<{
  readonly?: boolean;
}>();

const { t } = useI18n();
const { copy, copied } = useClipboard();

const handleCopy = async () => {
  if (model.value) {
    await copy(model.value);
  }
};
</script>

<i18n lang="yaml">
de:
  note: Notiz

en:
  note: Note
</i18n>
