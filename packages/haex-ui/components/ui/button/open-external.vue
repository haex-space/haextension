<template>
  <UiButtonIcon :icon="ExternalLink" v-bind="props" />
</template>

<script setup lang="ts">
import { ExternalLink } from "@lucide/vue";
import type { UiIconButtonProps } from "../../../lib/iconButton";

/** Opens what it sits next to outside this view: in the system app or at its web address. */
const props = defineProps<UiIconButtonProps>();
</script>
