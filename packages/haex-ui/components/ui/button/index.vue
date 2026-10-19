<script setup lang="ts">
import { buttonVariants } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "@lucide/vue";
import Button from "@/components/shadcn/button/Button.vue";
import type { ButtonVariants } from "@/components/shadcn/button";
import type { Component, HTMLAttributes } from "vue";
import type { PrimitiveProps } from "reka-ui";

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
  <Button
    :as
    :as-child="asChild"
    :class="
      cn('cursor-pointer', buttonVariants({ variant, size }), props.class)
    "
    :disabled="disabled || loading"
    :title="tooltip"
    @click="handleClick"
    :variant
  >
    <!-- As child, the slotted element becomes the button, so it must be the only child -->
    <slot v-if="asChild" />
    <template v-else>
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
    </template>
  </Button>
</template>
