<template>
  <div class="space-y-2">
    <UiLabel v-if="label">{{ label }}</UiLabel>

    <div class="flex items-center gap-2">
      <UiButton
        type="button"
        variant="outline"
        :disabled="readOnly"
        :style="model ? { backgroundColor: model, color: textColor } : {}"
        class="flex-1"
        @click="colorInputRef?.click()"
      >
        {{ model || t("label") }}
      </UiButton>

      <input
        ref="colorInputRef"
        v-model="model"
        type="color"
        :disabled="readOnly"
        class="sr-only"
      />

      <UiButton
        type="button"
        variant="outline"
        size="icon"
        :disabled="readOnly || !model"
        @click="model = null"
      >
        <RotateCcw class="h-4 w-4" />
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RotateCcw } from "lucide-vue-next";

defineProps<{
  label?: string;
  readOnly?: boolean;
}>();

const model = defineModel<string | null>();
const { t } = useI18n();

const colorInputRef = ref<HTMLInputElement>();

const { getTextColor } = useIconComponents();

const textColor = computed(() => {
  if (!model.value) return undefined;
  return getTextColor(model.value);
});
</script>

<i18n lang="yaml">
de:
  label: Farbe wählen
  reset: Zurücksetzen

en:
  label: Choose color
  reset: Reset
</i18n>
