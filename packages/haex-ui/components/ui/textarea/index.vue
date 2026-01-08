<template>
  <div
    :class="[
      'group relative transition-[color,box-shadow] rounded-md border border-input focus-within:border-primary focus-within:ring-primary/50 focus-within:ring-[3px]',
      props.class,
    ]"
  >
    <ShadcnTextarea
      ref="textareaRef"
      v-model="modelValue"
      v-bind="$attrs"
      class="border-none shadow-none focus-visible:ring-0 focus-visible:border-transparent pr-12"
    />

    <div class="absolute top-2 right-2 flex flex-col gap-1">
      <slot name="actions">
        <UiButton
          v-if="withCopy"
          :icon="copied ? Check : Copy"
          :tooltip="copied ? t('copied') : t('copy')"
          variant="ghost"
          size="icon-sm"
          data-slot="button"
          @click.prevent="handleCopy"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { useClipboard } from "@vueuse/core";
import { Copy, Check } from "lucide-vue-next";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  withCopy?: boolean;
  class?: HTMLAttributes["class"];
}>();

const modelValue = defineModel<string | number | null | undefined>();

const { t } = useI18n();
const { copy, copied } = useClipboard();

const textareaRef = useTemplateRef("textareaRef");

const handleCopy = async () => {
  if (modelValue.value) {
    await copy(String(modelValue.value));
  }
};

const focus = () => {
  textareaRef.value?.$el?.focus();
};

defineExpose({ focus });
</script>

<style scoped>
/* Buttons im Textarea transparent halten */
:deep([data-slot="button"]) {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

/* Hover-Effekt für Light und Dark Mode */
:deep([data-slot="button"]:hover) {
  background-color: rgba(0, 0, 0, 0.1) !important;
}

:deep(.dark [data-slot="button"]:hover),
:deep([data-slot="button"]:hover:is(.dark *)) {
  background-color: rgba(255, 255, 255, 0.1) !important;
}
</style>

<i18n lang="yaml">
de:
  copy: Kopieren
  copied: Kopiert!

en:
  copy: Copy
  copied: Copied!
</i18n>
