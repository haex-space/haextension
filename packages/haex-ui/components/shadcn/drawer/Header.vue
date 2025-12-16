<script lang="ts" setup>
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="drawer-header"
    :class="cn('flex flex-col gap-1.5 p-4', props.class)"
  >
    <!-- Drag handle / knob for bottom drawer -->
    <div class="mx-auto -mt-2 mb-2 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
    <slot />
  </div>
</template>
