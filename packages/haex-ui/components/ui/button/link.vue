<template>
  <UiButtonIcon :icon="Link" v-bind="props" />
</template>

<script setup lang="ts">
import { Link } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Links to another entry, or inserts a reference. */
const props = defineProps<UiIconButtonProps>();
</script>
