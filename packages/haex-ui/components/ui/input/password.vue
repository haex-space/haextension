<template>
  <UiInput
    ref="inputRef"
    v-model="model"
    :type="showPassword ? 'text' : 'password'"
    v-bind="$attrs"
  >
    <template #append>
      <UiButton
        :icon="showPassword ? EyeOff : Eye"
        :tooltip="showPassword ? labels.hide : labels.show"
        variant="ghost"
        class="shadow-none"
        @click.prevent="showPassword = !showPassword"
      />
      <UiButton
        v-if="copyable"
        :icon="copied ? Check : Copy"
        :tooltip="copied ? labels.copied : labels.copy"
        variant="ghost"
        class="shadow-none"
        @click.prevent="handleCopy"
      />
    </template>
  </UiInput>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Eye, EyeOff, Copy, Check } from "@lucide/vue";

export type UiInputPasswordLabels = {
  show: string;
  hide: string;
  copy: string;
  copied: string;
};

withDefaults(
  defineProps<{
    copyable?: boolean;
    /** Tooltip texts. Pass translated strings from the app; defaults are German. */
    labels?: UiInputPasswordLabels;
  }>(),
  {
    copyable: false,
    labels: () => ({
      show: "Passwort anzeigen",
      hide: "Passwort verbergen",
      copy: "Kopieren",
      copied: "Kopiert!",
    }),
  },
);

const model = defineModel<string | null>();

const showPassword = ref(false);
const { copy, copied } = useClipboard();

const handleCopy = async () => {
  if (model.value) {
    await copy(model.value);
  }
};
</script>
