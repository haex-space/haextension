<script setup lang="ts">
import type { CalendarGridBodyProps } from "reka-ui"
import { CalendarGridBody, useForwardProps } from "reka-ui"

const props = defineProps<CalendarGridBodyProps>()
const forwardedProps = useForwardProps(props)
</script>

<template>
  <CalendarGridBody data-slot="calendar-grid-body" v-bind="forwardedProps">
    <slot />
  </CalendarGridBody>
</template>
