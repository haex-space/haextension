<script setup lang="ts">
import type { ContextMenuTriggerProps } from "reka-ui"
import { ContextMenuTrigger, injectContextMenuRootContext, useForwardProps } from "reka-ui"

const props = defineProps<ContextMenuTriggerProps>()

const forwardedProps = useForwardProps(props)
const rootContext = injectContextMenuRootContext()
</script>

<template>
  <!-- Reka always sets `pointer-events: auto` on the trigger. While another select or menu disables
       pointer events on the body, clicks then fell through anything lying above the trigger onto
       it. Like reka's Combobox, only keep it while this menu is open. -->
  <ContextMenuTrigger
    v-bind="forwardedProps"
    :style="{ pointerEvents: rootContext.open.value ? 'auto' : undefined }"
  >
    <slot />
  </ContextMenuTrigger>
</template>
