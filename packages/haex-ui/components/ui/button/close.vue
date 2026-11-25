<template>
  <UiButtonIcon :icon="X" v-bind="props" />
</template>

<script setup lang="ts">
import { X } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Closes a panel, dialog or viewer, or clears a selection or an entry in a list. */
const props = defineProps<UiIconButtonProps>();
</script>
