<template>
  <UiButton
    type="button"
    variant="ghost"
    size="icon"
    :icon="Download"
    class="size-8 text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:text-primary"
    :aria-label="label"
    :tooltip="label"
    :loading="loading"
    :disabled="disabled"
  />
</template>

<script setup lang="ts">
import { Download } from "@lucide/vue";

/**
 * "Download this" next to an entry that is not on this device yet: a quiet download icon that takes
 * the primary colour on hover and keyboard focus, the counterpart of `UiButtonDelete` once the
 * entry is here. `label` names what is downloaded, for screen readers and the tooltip.
 */
defineProps<{
  label: string;
  loading?: boolean;
  disabled?: boolean;
}>();
</script>
