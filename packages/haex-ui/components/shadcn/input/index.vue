<script setup lang="ts">
import type { Component, HTMLAttributes } from "vue"
import { useVModel, useElementSize } from "@vueuse/core"
import { cn } from "@/lib/utils"

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes["class"]
  prependIcon?: Component
  appendIcon?: Component
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})

const appendRef = ref<HTMLDivElement>()
const { width: appendWidth } = useElementSize(appendRef)

const inputPaddingRight = computed(() => {
  if (appendWidth.value > 0) {
    return `${appendWidth.value + 8}px` // +8px for extra spacing
  }
  if (props.appendIcon) {
    return '2.5rem' // pr-10
  }
  return '0.75rem' // pr-3 (default)
})
</script>

<template>
  <div class="relative w-full items-center">
    <!-- Prepend icon -->
    <span
      v-if="prependIcon"
      class="absolute start-0 inset-y-0 flex items-center justify-center px-2 pointer-events-none"
    >
      <component :is="prependIcon" class="size-6 text-muted-foreground" />
    </span>

    <!-- Input field -->
    <input
      v-model="modelValue"
      v-bind="$attrs"
      data-slot="input"
      :class="cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-primary focus-visible:ring-primary/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        props.class,
      )"
      :style="{
        paddingLeft: prependIcon ? '2.5rem' : '0.75rem',
        paddingRight: inputPaddingRight
      }"
    >

    <!-- Append icon (only if no append slot) -->
    <span
      v-if="appendIcon && !$slots.append"
      class="absolute end-0 inset-y-0 flex items-center justify-center px-2 pointer-events-none"
    >
      <component :is="appendIcon" class="size-6 text-muted-foreground" />
    </span>

    <!-- Append slot for buttons -->
    <div
      v-if="$slots.append"
      ref="appendRef"
      class="absolute end-0 inset-y-0 flex items-center gap-1 px-1"
    >
      <slot name="append" />
    </div>
  </div>
</template>
