<template>
  <UiButton
    type="button"
    variant="ghost"
    size="icon"
    :icon="Download"
    class="size-8 text-muted-foreground"
    :class="iconButtonHoverClass(hover)"
    :aria-label="label"
    :tooltip="label"
    :loading="loading"
    :disabled="disabled"
  />
</template>

<script setup lang="ts">
import { Download } from "@lucide/vue";
import { iconButtonHoverClass } from "../../../lib/iconButton";
import type { UiIconButtonHover } from "../../../lib/iconButton";

/**
 * "Download this" next to an entry that is not on this device yet: a quiet download icon that takes
 * the primary colour on hover and keyboard focus, the counterpart of `UiButtonDelete` once the
 * entry is here. `label` names what is downloaded, for screen readers and the tooltip.
 */
withDefaults(
  defineProps<{
    label: string;
    loading?: boolean;
    disabled?: boolean;
    /** The hover colour; the primary one unless the app says another. */
    hover?: UiIconButtonHover;
  }>(),
  { hover: "primary" },
);
</script>
