<template>
  <UiButtonIcon :icon="EllipsisVertical" v-bind="props" />
</template>

<script setup lang="ts">
import { EllipsisVertical } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Opens the menu of more actions; it is the trigger of the menu, not the menu. */
const props = defineProps<UiIconButtonProps>();
</script>
