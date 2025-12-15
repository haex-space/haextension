<script setup lang="ts">
import type { SplitterPanelProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { SplitterPanel } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<SplitterPanelProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <SplitterPanel v-bind="delegatedProps" :class="cn(props.class)">
    <slot />
  </SplitterPanel>
</template>
