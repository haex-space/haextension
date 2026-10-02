<template>
  <div :class="['relative w-full', props.class]">
    <div
      class="group relative transition-[color,box-shadow] rounded-md border border-input focus-within:border-primary focus-within:ring-primary/50 focus-within:ring-[3px] has-[[aria-invalid=true]]:border-destructive"
      :style="labelStyle"
    >
      <ShadcnTextarea
        ref="textareaRef"
        v-model="textareaValue"
        v-bind="$attrs"
        :class="[
          'peer border-none shadow-none focus-visible:ring-0 focus-visible:border-transparent pr-12',
          labelledPlaceholderClass(label),
        ]"
        :placeholder="labelledPlaceholder(label, $attrs.placeholder)"
        :id="fieldId"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
      />

      <label
        v-if="label"
        :for="fieldId"
        :class="[
          floatingLabelBase,
          floatingLabelRestMulti,
          'left-2',
          floatingLabelFloated,
          error ? 'text-destructive peer-focus:text-destructive' : '',
        ]"
        data-slot="floating-label"
      >
        {{ label }}
      </label>

      <div class="absolute top-2 right-2 flex flex-col gap-1">
        <slot name="actions">
          <UiButton
            v-if="withCopy"
            :icon="copied ? Check : Copy"
            :tooltip="copied ? props.labels.copied : props.labels.copy"
            variant="ghost"
            size="icon-sm"
            data-slot="button"
            @click.prevent="handleCopy"
          />
        </slot>
      </div>
    </div>

    <p v-if="error" :id="errorId" class="mt-1 px-1 text-xs text-destructive" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useId, type HTMLAttributes } from "vue";
import { useClipboard } from "@vueuse/core";
import { Copy, Check } from "@lucide/vue";
import {
  LABEL_BG_VAR,
  floatingLabelBase,
  floatingLabelFloated,
  floatingLabelRestMulti,
  labelledPlaceholder,
  labelledPlaceholderClass,
} from "../../../lib/floating-label";

defineOptions({ inheritAttrs: false });

export type UiTextareaLabels = {
  copy: string;
  copied: string;
};

const props = withDefaults(
  defineProps<{
    withCopy?: boolean;
    class?: HTMLAttributes["class"];
    /** Floating label on the border of the field. */
    label?: string;
    /** CSS colour of the surface behind the field; the label uses it to cover the border. */
    labelBg?: string;
    /** Error text under the field; also marks the field invalid. */
    error?: string;
    /** Tooltip texts for the copy button. Defaults are German. */
    labels?: UiTextareaLabels;
  }>(),
  {
    withCopy: false,
    class: undefined,
    labels: () => ({ copy: "Kopieren", copied: "Kopiert!" }),
  },
);

const attrs = useAttrs();

// Ties the label and the error text to the textarea even when the consumer passes no id.
const generatedId = useId();
const fieldId = computed(() => (attrs.id as string | undefined) ?? generatedId);
const errorId = `${generatedId}-error`;
// Keeps a consumer's aria-describedby and adds the error text while there is one.
const describedBy = computed(() =>
  [attrs["aria-describedby"] as string | undefined, props.error ? errorId : undefined]
    .filter(Boolean)
    .join(" ") || undefined,
);

const modelValue = defineModel<string | number | null | undefined>();

// Convert null to undefined for ShadcnTextarea compatibility
const textareaValue = computed({
  get: () => modelValue.value ?? undefined,
  set: (val) => { modelValue.value = val; },
});

const labelStyle = computed(() => (props.labelBg ? { [LABEL_BG_VAR]: props.labelBg } : undefined));

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
