<template>
  <UiButton
    type="button"
    :icon="copied ? Check : Copy"
    :tooltip="copied ? labels.copied : labels.copy"
    variant="ghost"
    @click.prevent="handleCopy"
  />
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Check, Copy } from "@lucide/vue";

export type UiButtonCopyLabels = {
  copy: string;
  copied: string;
};

const props = defineProps<{
  /** What the button copies; an empty value copies nothing. */
  value: string | number | null | undefined;
  labels: UiButtonCopyLabels;
}>();

const { copy, copied } = useClipboard();

const handleCopy = async () => {
  if (props.value === null || props.value === undefined || props.value === "") return;
  await copy(String(props.value));
};
</script>
