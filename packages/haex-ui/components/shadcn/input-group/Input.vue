<script setup lang="ts">
import { onMounted, ref, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  autofocus?: boolean;
}>();

const model = defineModel<string | number | null>();

const inputElement = ref<HTMLInputElement | null>(null);

// The native attribute only acts on page load, so inputs mounted later (drawers, dialogs) focus here
onMounted(() => {
  if (props.autofocus) inputElement.value?.focus();
});

// Methode nach außen freigeben
defineExpose({
  focus: () => inputElement.value?.focus(),
  el: inputElement,
});
</script>

<template>
  <input
    :value="model"
    data-slot="input-group-control"
    ref="inputElement"
    :class="
      cn(
        'flex-1 min-w-0 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent px-3 py-1 text-base outline-none md:text-sm',
        props.class
      )
    "
    @input="model = ($event.target as HTMLInputElement).value"
  />
</template>
