<script setup lang="ts">
import type { Component, HTMLAttributes } from "vue";
import type { PrimitiveProps } from "reka-ui";
import type { ButtonVariants } from ".";
import { Primitive } from "reka-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from ".";
import { Loader2 } from "lucide-vue-next";

interface Props extends PrimitiveProps {
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  class?: HTMLAttributes["class"];
  icon?: Component;
  prependIcon?: Component;
  appendIcon?: Component;
  iconClass?: string;
  loading?: boolean;
  tooltip?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
  loading: false,
  disabled: false,
});

const emit = defineEmits(["click"]);

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit("click", event);
  }
};
</script>

<template>
  <Primitive
    data-slot="button"
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
    :disabled="disabled || loading"
    :title="tooltip"
    @click="handleClick"
  >
    <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
    <component
      v-else-if="icon || prependIcon"
      :is="icon || prependIcon"
      :class="iconClass"
    />
    <slot />
    <component
      v-if="appendIcon && !loading"
      :is="appendIcon"
      :class="iconClass"
    />
  </Primitive>
</template>
