<template>
  <UiButtonIcon :icon="Info" v-bind="props" />
</template>

<script setup lang="ts">
import { Info } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Shows more about what it sits next to. */
const props = defineProps<UiIconButtonProps>();
</script>
