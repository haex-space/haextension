<template>
  <ShadcnInputGroup
    class="group transition-[color,box-shadow] focus-within:border-primary focus-within:ring-primary/50 focus-within:ring-[3px]"
  >
    <slot name="prepend">
      <component :is="prependIcon" />
    </slot>

    <ShadcnInputGroupInput
      v-model="modelValue"
      v-bind="$attrs"
      class="flex-1"
      ref="inputRef"
      :autofocus
    />

    <slot name="append">
      <component :is="appendIcon" />
    </slot>
  </ShadcnInputGroup>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  prependIcon?: Component;
  appendIcon?: Component;
  autofocus?: boolean;
}>();

const modelValue = defineModel<string | number | null | undefined>();

const inputRef = useTemplateRef("inputRef");

const focus = () => {
  inputRef.value?.focus();
};

defineExpose({ focus });
</script>

<style scoped>
/* Dieser Selektor ist die "Atom-Bombe" gegen den Dark-Mode-Kasten */
:deep([data-slot="input-group"]) button,
:deep([data-slot="input-group"]) [data-slot="button"],
:deep([data-slot="input-group"]) .copy-button-reset {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

/* Verhindert, dass Shadcn im Dark Mode bei Fokus eine Hintergrundfarbe aufzwingt */
:deep(.group:focus-within) [data-slot="button"] {
  background-color: transparent !important;
}

/* Hover muss explizit im Dark Mode definiert sein, um sichtbar zu sein */
:deep([data-slot="button"]:hover) {
  background-color: rgba(255, 255, 255, 0.1) !important;
}
</style>
