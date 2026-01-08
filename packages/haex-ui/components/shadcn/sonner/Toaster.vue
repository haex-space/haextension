<script lang="ts" setup>
import type { ToasterProps } from "vue-sonner";
import { Toaster as Sonner } from "vue-sonner";
import "vue-sonner/style.css";

const props = withDefaults(defineProps<ToasterProps>(), {
  richColors: true,
});
</script>

<template>
  <Sonner
    class="toaster group"
    v-bind="props"
  />
</template>
