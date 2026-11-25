<template>
  <UiButtonIcon :icon="Plus" v-bind="props" />
</template>

<script setup lang="ts">
import { Plus } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Adds an entry. */
const props = defineProps<UiIconButtonProps>();
</script>
