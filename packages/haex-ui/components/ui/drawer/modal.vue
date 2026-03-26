<template>
  <!-- Small Screen: Drawer -->
  <ShadcnDrawer v-if="isSmallScreen" v-model:open="open">
    <!-- Trigger Button -->
    <slot name="trigger" />

    <!-- Drawer Content -->
    <ShadcnDrawerContent class="flex flex-col max-h-[85vh]">
      <ShadcnDrawerHeader v-if="title || description || $slots.header" class="shrink-0">
        <slot name="header">
          <ShadcnDrawerTitle v-if="title">{{ title }}</ShadcnDrawerTitle>
          <ShadcnDrawerDescription v-if="description">
            {{ description }}
          </ShadcnDrawerDescription>
        </slot>
      </ShadcnDrawerHeader>

      <!-- Scrollable Content -->
      <ShadcnScrollArea class="flex-1 min-h-0 px-4 pb-4">
        <slot name="content" />
      </ShadcnScrollArea>

      <!-- Footer (optional) -->
      <ShadcnDrawerFooter v-if="$slots.footer" class="shrink-0 border-t border-border">
        <slot name="footer" />
      </ShadcnDrawerFooter>
    </ShadcnDrawerContent>
  </ShadcnDrawer>

  <!-- Large Screen: Dialog/Modal -->
  <ShadcnDialog v-else v-model:open="open">
    <!-- Trigger Button -->
    <slot name="trigger" />

    <!-- Dialog Content -->
    <ShadcnDialogContent :class="['flex flex-col max-h-[85vh]', contentClass]">
      <ShadcnDialogHeader v-if="title || description || $slots.header" class="shrink-0">
        <slot name="header">
          <ShadcnDialogTitle v-if="title">{{ title }}</ShadcnDialogTitle>
          <ShadcnDialogDescription v-if="description">
            {{ description }}
          </ShadcnDialogDescription>
        </slot>
      </ShadcnDialogHeader>

      <!-- Scrollable Dialog Body -->
      <ShadcnScrollArea class="flex-1 min-h-0">
        <slot name="content" />
      </ShadcnScrollArea>

      <!-- Dialog Footer (optional) -->
      <ShadcnDialogFooter v-if="$slots.footer" class="shrink-0 border-t border-border">
        <slot name="footer" />
      </ShadcnDialogFooter>
    </ShadcnDialogContent>
  </ShadcnDialog>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core"

defineProps<{
  title?: string
  description?: string
  contentClass?: HTMLAttributes["class"]
}>()

const open = defineModel<boolean>("open", { default: false })

// Detect small screen using Tailwind breakpoints
// "smaller('md')" means: xs, sm (below 768px)
const breakpoints = useBreakpoints(breakpointsTailwind)
const isSmallScreen = breakpoints.smaller("md")
</script>
