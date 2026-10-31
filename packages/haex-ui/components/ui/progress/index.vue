<script setup lang="ts">
/**
 * A progress bar that also covers the unknown total: `value` is the percent (0–100), `null` while
 * the end is not known — the bar then shows a third and pulses. `bar` is a track of its own;
 * `backdrop` fills its parent from the left behind the content, e.g. a list row that downloads
 * (the parent needs `relative overflow-hidden`, its content `relative z-10`). `label` names the
 * bar for screen readers; without it they read the percent or, for an unknown total, "Fortschritt".
 */
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { ProgressIndicator, ProgressRoot } from "reka-ui"
import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<{
    value: number | null
    label?: string
    variant?: "bar" | "backdrop"
    class?: HTMLAttributes["class"]
  }>(),
  { variant: "bar" },
)

const percent = computed(() =>
  props.value === null || Number.isNaN(props.value)
    ? null
    : Math.min(100, Math.max(0, props.value)),
)

function valueLabel(value: number | null | undefined): string | undefined {
  if (props.label !== undefined) return props.label
  return value === null || value === undefined ? "Fortschritt" : `${Math.round(value)}%`
}
</script>

<template>
  <ProgressRoot
    data-slot="progress"
    :model-value="percent"
    :max="100"
    :get-value-label="valueLabel"
    :class="
      cn(
        variant === 'bar'
          ? 'bg-muted h-2 w-full overflow-hidden rounded-full'
          : 'pointer-events-none absolute inset-0',
        props.class,
      )
    "
  >
    <ProgressIndicator
      data-slot="progress-indicator"
      :class="
        cn(
          'h-full transition-[width] duration-150 motion-reduce:transition-none',
          variant === 'bar' ? 'bg-primary rounded-full' : 'bg-primary/10',
          percent === null && 'animate-pulse motion-reduce:animate-none',
        )
      "
      :style="{ width: `${percent ?? 35}%` }"
    />
  </ProgressRoot>
</template>
