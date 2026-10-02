<template>
  <div :class="['relative w-full', props.class]">
    <ShadcnInputGroup
      :class="[
        'group transition-[color,box-shadow] focus-within:border-primary focus-within:ring-primary/50 focus-within:ring-[3px]',
        props.label ? 'overflow-visible' : '',
      ]"
      :style="labelStyle"
    >
      <slot name="prepend">
        <component :is="prependIcon" />
      </slot>

      <ShadcnInputGroupInput
        v-model="modelValue"
        v-bind="$attrs"
        :class="['peer flex-1', labelledPlaceholderClass(label)]"
        ref="inputRef"
        :autofocus
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
          floatingLabelRestSingle,
          hasPrepend ? 'left-9' : 'left-2',
          floatingLabelFloated,
          error ? 'text-destructive peer-focus:text-destructive' : '',
        ]"
        data-slot="floating-label"
      >
        {{ label }}
      </label>

      <slot name="append">
        <component :is="appendIcon" />
      </slot>

      <UiButton
        v-if="clearable && hasValue && !isLocked"
        :icon="X"
        :tooltip="labels.clear"
        variant="ghost"
        class="shadow-none"
        @click.prevent="clear"
      />
      <UiButton
        v-if="copyable && hasValue"
        :icon="copied ? Check : Copy"
        :tooltip="copied ? labels.copied : labels.copy"
        variant="ghost"
        class="shadow-none"
        @click.prevent="handleCopy"
      />
    </ShadcnInputGroup>

    <p v-if="error" :id="errorId" class="mt-1 px-1 text-xs text-destructive" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useId, type HTMLAttributes } from "vue";
import { useClipboard } from "@vueuse/core";
import { Check, Copy, X } from "@lucide/vue";
import {
  LABEL_BG_VAR,
  floatingLabelBase,
  floatingLabelFloated,
  floatingLabelRestSingle,
  labelledPlaceholder,
  labelledPlaceholderClass,
} from "../../../lib/floating-label";

defineOptions({ inheritAttrs: false });

export type UiInputLabels = {
  copy: string;
  copied: string;
  clear: string;
};

const props = withDefaults(
  defineProps<{
    prependIcon?: Component;
    appendIcon?: Component;
    autofocus?: boolean;
    class?: HTMLAttributes["class"];
    /** Floating label on the border of the field. */
    label?: string;
    /** CSS colour of the surface behind the field; the label uses it to cover the border. */
    labelBg?: string;
    /** Error text under the field; also marks the field invalid. */
    error?: string;
    /** Show a button that empties the field. */
    clearable?: boolean;
    /** Show a button that copies the value. */
    copyable?: boolean;
    /** Tooltip texts of the buttons. Pass translated strings from the app; defaults are German. */
    labels?: UiInputLabels;
  }>(),
  {
    labels: () => ({
      copy: "Kopieren",
      copied: "Kopiert!",
      clear: "Leeren",
    }),
  },
);

const attrs = useAttrs();
const slots = useSlots();

// Ties the label and the error text to the input even when the consumer passes no id.
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

const inputRef = useTemplateRef("inputRef");

const hasPrepend = computed(() => !!slots.prepend || !!props.prependIcon);
const hasValue = computed(
  () => modelValue.value !== undefined && modelValue.value !== null && modelValue.value !== "",
);
const isOn = (value: unknown) => value !== undefined && value !== false;
const isLocked = computed(() => isOn(attrs.disabled) || isOn(attrs.readonly));
const labelStyle = computed(() => (props.labelBg ? { [LABEL_BG_VAR]: props.labelBg } : undefined));

const { copy, copied } = useClipboard();

const clear = () => {
  modelValue.value = "";
  inputRef.value?.focus();
};

const handleCopy = async () => {
  if (hasValue.value) await copy(String(modelValue.value));
};

const focus = () => {
  inputRef.value?.focus();
};

defineExpose({ focus });
</script>

<style scoped>
/* Dieser Selektor ist die "Atom-Bombe" gegen den Dark-Mode-Kasten */
:deep([data-slot="input-group"]) button,
:deep([data-slot="input-group"]) [data-slot="button"],
:deep([data-slot="input-group"]) .copy-button-reset {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

/* Verhindert, dass Shadcn im Dark Mode bei Fokus eine Hintergrundfarbe aufzwingt */
:deep(.group:focus-within) [data-slot="button"] {
  background-color: transparent !important;
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
