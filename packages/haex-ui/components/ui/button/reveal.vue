<template>
  <UiButtonIcon
    :size="size"
    :variant="variant"
    :loading="loading"
    :disabled="disabled"
    :icon-class="iconClass"
    :hover="hover"
    :icon="revealed ? EyeOff : Eye"
    :label="revealed ? (revealedLabel ?? label) : label"
    :aria-pressed="revealed"
  />
</template>

<script setup lang="ts">
import { Eye, EyeOff } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/**
 * Shows or hides a value that is masked (a password, a code): the eye while it is hidden, the
 * crossed eye while it shows. `label` names the action while hidden ("Show password"),
 * `revealedLabel` while shown ("Hide"); without it `label` stays.
 */
withDefaults(
  defineProps<
    UiIconButtonProps & {
      /** Whether the value shows right now. */
      revealed?: boolean;
      revealedLabel?: string;
    }
  >(),
  { revealed: false },
);
</script>
