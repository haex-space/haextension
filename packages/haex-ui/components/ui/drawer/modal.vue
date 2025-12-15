<template>
  <!-- Small Screen: Drawer -->
  <ShadcnDrawer v-if="isSmallScreen" v-model:open="open">
    <!-- Trigger Button -->
    <slot name="trigger" />

    <!-- Drawer Content -->
    <ShadcnDrawerContent>
      <ShadcnDrawerHeader v-if="title || description || $slots.header">
        <slot name="header">
          <ShadcnDrawerTitle v-if="title">{{ title }}</ShadcnDrawerTitle>
          <ShadcnDrawerDescription v-if="description">
            {{ description }}
          </ShadcnDrawerDescription>
        </slot>
      </ShadcnDrawerHeader>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        <slot name="content" />
      </div>

      <!-- Footer (optional) -->
      <ShadcnDrawerFooter v-if="$slots.footer">
        <slot name="footer" />
      </ShadcnDrawerFooter>
    </ShadcnDrawerContent>
  </ShadcnDrawer>

  <!-- Large Screen: Dialog/Modal -->
  <ShadcnDialog v-else v-model:open="open">
    <!-- Trigger Button -->
    <slot name="trigger" />

    <!-- Dialog Content -->
    <ShadcnDialogContent :class="contentClass">
      <ShadcnDialogHeader v-if="title || description || $slots.header">
        <slot name="header">
          <ShadcnDialogTitle v-if="title">{{ title }}</ShadcnDialogTitle>
          <ShadcnDialogDescription v-if="description">
            {{ description }}
          </ShadcnDialogDescription>
        </slot>
      </ShadcnDialogHeader>

      <!-- Dialog Body -->
      <div class="space-y-4">
        <slot name="content" />
      </div>

      <!-- Dialog Footer (optional) -->
      <ShadcnDialogFooter v-if="$slots.footer">
        <slot name="footer" />
      </ShadcnDialogFooter>
    </ShadcnDialogContent>
  </ShadcnDialog>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { useWindowSize } from "@vueuse/core"

defineProps<{
  title?: string
  description?: string
  contentClass?: HTMLAttributes["class"]
}>()

const open = defineModel<boolean>("open", { default: false })

// Detect small screen (mobile)
const { width } = useWindowSize()
const isSmallScreen = computed(() => width.value < 640) // sm breakpoint
</script>
