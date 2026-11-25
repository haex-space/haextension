<template>
  <UiButtonIcon :icon="ArrowDown" v-bind="props" />
</template>

<script setup lang="ts">
import { ArrowDown } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Moves an entry of a list one place down. */
const props = defineProps<UiIconButtonProps>();
</script>
