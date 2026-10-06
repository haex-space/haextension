<script setup lang="ts">
import type { VariantProps } from "class-variance-authority"
import type { ToggleGroupItemProps } from "reka-ui"
import type { HTMLAttributes, Ref } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ToggleGroupItem, useForwardProps } from "reka-ui"
import { computed, inject } from "vue"
import { cn } from "@/lib/utils"
import { toggleVariants } from '@/components/shadcn/toggle'

type ToggleGroupVariants = VariantProps<typeof toggleVariants>
type ToggleGroupContext = {
  variant: Ref<ToggleGroupVariants["variant"]>
  size: Ref<ToggleGroupVariants["size"]>
}

const props = defineProps<ToggleGroupItemProps & {
  class?: HTMLAttributes["class"]
  variant?: ToggleGroupVariants["variant"]
  size?: ToggleGroupVariants["size"]
}>()

const context = inject<ToggleGroupContext>("toggleGroup")
const variant = computed(() => context?.variant.value ?? props.variant)
const size = computed(() => context?.size.value ?? props.size)

const delegatedProps = reactiveOmit(props, "class", "size", "variant")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ToggleGroupItem
    v-slot="slotProps"
    v-bind="forwardedProps" :class="cn(toggleVariants({
      variant,
      size,
    }), props.class)"
  >
    <slot v-bind="slotProps" />
  </ToggleGroupItem>
</template>
