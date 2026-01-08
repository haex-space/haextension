<template>
  <UiInput ref="inputRef" v-model="model">
    <template #append>
      <slot name="append" />
      <UiButton
        v-if="withCopy"
        :icon="copied ? Check : Copy"
        :tooltip="copied ? t('copied') : t('copy')"
        variant="ghost"
        @click.prevent="handleCopy"
      />
    </template>
  </UiInput>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Copy, Check } from "lucide-vue-next";

const model = defineModel<string | number | undefined | null>();

const { withCopy = true } = defineProps<{ withCopy?: boolean }>();

const { t } = useI18n();
const { copy, copied } = useClipboard();

const handleCopy = async () => {
  if (model.value) {
    // Resolve KeePass-style references before copying
    const { resolveReferenceAsync } = useGroupItemsCloneStore();
    const resolvedValue = await resolveReferenceAsync(String(model.value));
    await copy(resolvedValue || String(model.value));
  }
};

const inputRef = useTemplateRef("inputRef");
const focus = () => inputRef.value?.focus();

defineExpose({ focus });
</script>

<i18n lang="yaml">
de:
  copy: Kopieren
  copied: Kopiert!

en:
  copy: Copy
  copied: Copied!
</i18n>
