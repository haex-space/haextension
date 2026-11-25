<template>
  <UiButtonIcon :icon="ArrowUp" v-bind="props" />
</template>

<script setup lang="ts">
import { ArrowUp } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Moves an entry of a list one place up. */
const props = defineProps<UiIconButtonProps>();
</script>
