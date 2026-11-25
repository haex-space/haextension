<template>
  <UiButtonIcon :icon="ArrowLeft" v-bind="props" />
</template>

<script setup lang="ts">
import { ArrowLeft } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Goes one step back. */
const props = defineProps<UiIconButtonProps>();
</script>
