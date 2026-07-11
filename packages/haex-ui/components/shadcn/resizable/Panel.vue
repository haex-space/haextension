<script setup lang="ts">
import type { SplitterPanelProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { SplitterPanel } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<SplitterPanelProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const panelRef = ref<InstanceType<typeof SplitterPanel> | null>(null)

defineExpose({
  collapse: () => panelRef.value?.collapse(),
  expand: () => panelRef.value?.expand(),
  getSize: () => panelRef.value?.getSize(),
  resize: (size: number) => panelRef.value?.resize(size),
  isCollapsed: () => panelRef.value?.isCollapsed(),
  isExpanded: () => panelRef.value?.isExpanded(),
})
</script>

<template>
  <SplitterPanel ref="panelRef" v-bind="delegatedProps" :class="cn(props.class)">
    <slot />
  </SplitterPanel>
</template>
