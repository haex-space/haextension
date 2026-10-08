<script setup lang="ts">
/**
 * A radio item that brings no look of its own: the slot is its whole content (a colour swatch, an
 * icon, a segment). Arrow keys, roving focus and `role="radio"` come from the surrounding
 * `ShadcnRadioGroup`; style the checked state with `data-[state=checked]:`. A radio group cannot
 * be cleared by clicking the checked item again; an app that wants that handles `click` itself.
 */
import type { RadioGroupItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { RadioGroupItem, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<RadioGroupItemProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <RadioGroupItem
    data-slot="radio-group-tile"
    v-bind="forwardedProps"
    :class="
      cn(
        'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </RadioGroupItem>
</template>
