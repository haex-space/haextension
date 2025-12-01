<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
  autofocus?: boolean
}>()

const model = defineModel<string | number | null>()

const inputRef = useTemplateRef<HTMLInputElement>("input")

// Auto-focus when autofocus prop is true
watch(
  () => props.autofocus,
  (shouldFocus) => {
    if (shouldFocus) {
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  },
  { immediate: true }
)
</script>

<template>
  <input
    ref="input"
    v-model="model"
    data-slot="input-group-control"
    :class="cn(
      'flex-1 min-w-0 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent px-3 py-1 text-base outline-none md:text-sm',
      props.class,
    )"
  >
</template>
