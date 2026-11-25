<template>
  <UiButton
    type="button"
    :variant="variant"
    :size="size"
    :icon="icon"
    :icon-class="iconClass"
    :class="iconButtonHoverClass(hover)"
    :aria-label="label"
    :tooltip="label"
    :loading="loading"
    :disabled="disabled"
  >
    <slot />
  </UiButton>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import { iconButtonHoverClass } from "../../../lib/iconButton";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/**
 * The base of the icon buttons: a quiet ghost button that holds one icon and is named by `label`; it
 * takes the primary colour on hover and keyboard focus unless `hover` says another (the delete
 * button turns red).
 * The named ones (`UiButtonClose`, `UiButtonBack`, ...) are this with their icon; use this directly
 * only for an action that has no component of its own. The icon is a component (`icon`) or, for an
 * Iconify icon or one that changes, the default slot.
 */
withDefaults(defineProps<UiIconButtonProps & { icon?: Component }>(), {
  size: "icon",
  variant: "ghost",
  hover: "primary",
});
</script>
