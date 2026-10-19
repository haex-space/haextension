<template>
  <UiInput
    ref="inputRef"
    v-model="model"
    :type="showPassword ? 'text' : 'password'"
    v-bind="$attrs"
  >
    <template #append>
      <UiButton
        type="button"
        :icon="showPassword ? EyeOff : Eye"
        :tooltip="showPassword ? labels.hide : labels.show"
        variant="ghost"
        class="shadow-none"
        @click.prevent="showPassword = !showPassword"
      />
      <UiButtonCopy v-if="copyable" :value="model" :labels="labels" class="shadow-none" />
      <slot name="append" />
    </template>
  </UiInput>
</template>

<script setup lang="ts">
import { Eye, EyeOff } from "@lucide/vue";

// Attributes go to UiInput explicitly (v-bind="$attrs"); inheriting them as well would bind them twice
defineOptions({ inheritAttrs: false });

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

const inputRef = useTemplateRef("inputRef");
const showPassword = ref(false);

const focus = () => {
  inputRef.value?.focus();
};

defineExpose({ focus });
</script>
