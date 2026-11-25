<template>
  <UiButtonIcon :icon="Pencil" v-bind="props" />
</template>

<script setup lang="ts">
import { Pencil } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Edits or renames what it sits next to. */
const props = defineProps<UiIconButtonProps>();
</script>
