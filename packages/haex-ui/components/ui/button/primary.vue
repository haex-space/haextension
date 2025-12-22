<script setup lang="ts">
import type { Component } from "vue";

const props = withDefaults(
  defineProps<{
    icon?: Component;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  {
    disabled: false,
    loading: false,
  }
);

const emit = defineEmits(["click"]);
</script>

<template>
  <UiButton
    :icon="icon"
    :disabled="disabled"
    :loading="loading"
    variant="outline"
    class="w-full border-primary text-primary hover:bg-primary/10 hover:text-primary/80"
    @click="emit('click', $event)"
  >
    <slot />
  </UiButton>
</template>
