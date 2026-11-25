<template>
  <UiButton
    type="button"
    :variant="variant"
    :size="size"
    :icon="icon"
    :icon-class="iconClass"
    :aria-label="label"
    :tooltip="label"
    :loading="loading"
    :disabled="disabled"
  />
</template>

<script setup lang="ts">
import type { Component } from "vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/**
 * The base of the icon buttons: a quiet ghost button that holds one icon and is named by `label`.
 * The named ones (`UiButtonClose`, `UiButtonBack`, ...) are this with their icon; use this directly
 * only for an action that has no component of its own.
 */
withDefaults(defineProps<UiIconButtonProps & { icon: Component }>(), {
  size: "icon",
  variant: "ghost",
});
</script>
