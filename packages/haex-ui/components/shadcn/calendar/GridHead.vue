<script setup lang="ts">
import type { CalendarGridHeadProps } from "reka-ui"
import { CalendarGridHead, useForwardProps } from "reka-ui"

const props = defineProps<CalendarGridHeadProps>()
const forwardedProps = useForwardProps(props)
</script>

<template>
  <CalendarGridHead data-slot="calendar-grid-head" v-bind="forwardedProps">
    <slot />
  </CalendarGridHead>
</template>
