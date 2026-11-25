<template>
  <UiButtonIcon :icon="Save" v-bind="props" />
</template>

<script setup lang="ts">
import { Save } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Saves what it sits next to to the device. */
const props = defineProps<UiIconButtonProps>();
</script>
