<template>
  <ShadcnInput
    ref="wrapperRef"
    :model-value="model ?? undefined"
    v-bind="$attrs"
    @update:model-value="model = $event || null"
  />
</template>

<script setup lang="ts">
const model = defineModel<string | number | null>();

const wrapperRef = ref<{ $el: HTMLElement } | null>(null);

const focus = () => {
  const inputEl = wrapperRef.value?.$el?.querySelector('[data-slot="input"]') as HTMLInputElement | null;
  inputEl?.focus();
};

defineExpose({ focus });
</script>
