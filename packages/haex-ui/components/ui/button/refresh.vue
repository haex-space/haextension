<template>
  <UiButtonIcon :icon="RefreshCw" v-bind="props" />
</template>

<script setup lang="ts">
import { RefreshCw } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Reloads or runs again. */
const props = defineProps<UiIconButtonProps>();
</script>
