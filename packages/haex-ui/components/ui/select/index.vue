<template>
  <div :class="['relative w-full', props.class]" :style="labelStyle">
    <ShadcnSelect
      v-model="model"
      :disabled="disabled"
      @update:open="open = $event"
    >
      <ShadcnSelectTrigger
        :id="fieldId"
        :class="[
          'transition-[color,box-shadow] focus:border-primary focus:ring-primary/50 focus:ring-[3px] data-[state=open]:border-primary',
          error ? 'border-destructive' : '',
        ]"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? errorId : undefined"
        :aria-label="label ? undefined : ariaLabel"
      >
        <ShadcnSelectValue :placeholder="label ? '' : placeholder" />
      </ShadcnSelectTrigger>
      <ShadcnSelectContent>
        <ShadcnSelectItem
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </ShadcnSelectItem>
      </ShadcnSelectContent>
    </ShadcnSelect>

    <label
      v-if="label"
      :for="fieldId"
      :class="labelClass"
      data-slot="floating-label"
    >
      {{ label }}
    </label>

    <p v-if="error" :id="errorId" class="mt-1 px-1 text-xs text-destructive" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useId, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import {
  LABEL_BG_VAR,
  floatingLabelBase,
  floatingLabelRestSingle,
} from "../../../lib/floating-label";

export type UiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const props = defineProps<{
  options: UiSelectOption[];
  class?: HTMLAttributes["class"];
  /** Floating label on the border of the field; floats once there is a value or the list is open. */
  label?: string;
  /** CSS colour of the surface behind the field; the label uses it to cover the border. */
  labelBg?: string;
  /** Shown when nothing is chosen and there is no label. */
  placeholder?: string;
  /** Accessible name when no label is shown. */
  ariaLabel?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
}>();

const model = defineModel<string | null | undefined>();

// Ties the label and the error text to the trigger even when the consumer passes no id.
const generatedId = useId();
const fieldId = computed(() => props.id ?? generatedId);
const errorId = `${generatedId}-error`;

const open = ref(false);
const floated = computed(
  () => open.value || (model.value !== undefined && model.value !== null && model.value !== ""),
);
const labelClass = computed(() =>
  cn(
    floatingLabelBase,
    floated.value
      ? ["top-0 left-2 -translate-y-1/2 text-xs font-medium", open.value ? "text-primary" : "text-foreground"]
      : [floatingLabelRestSingle, "left-2"],
    props.error && "text-destructive",
  ),
);
const labelStyle = computed(() => (props.labelBg ? { [LABEL_BG_VAR]: props.labelBg } : undefined));
</script>
