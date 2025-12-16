<script setup lang="ts">
import type { DateValue } from "@internationalized/date"
import type { HTMLAttributes } from "vue"
import { CalendarDate, DateFormatter, getLocalTimeZone } from "@internationalized/date"
import { Calendar as CalendarIcon, X } from "lucide-vue-next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/shadcn/button"
import { Calendar } from "@/components/shadcn/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover"

const props = withDefaults(defineProps<{
  class?: HTMLAttributes["class"]
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  locale?: string
}>(), {
  placeholder: "Pick a date",
  disabled: false,
  clearable: true,
  locale: "en-US",
})

const emit = defineEmits<{
  cleared: []
}>()

// Model can be string (YYYY-MM-DD) or null
const model = defineModel<string | null>()

const isOpen = ref(false)

// Convert string date to DateValue for Calendar
const dateValue = computed<DateValue | undefined>({
  get: () => {
    if (!model.value) return undefined
    const [year, month, day] = model.value.split("-").map(Number)
    if (!year || !month || !day) return undefined
    return new CalendarDate(year, month, day)
  },
  set: (value: DateValue | undefined) => {
    if (!value) {
      model.value = null
    } else {
      // Format as YYYY-MM-DD
      const year = value.year
      const month = String(value.month).padStart(2, "0")
      const day = String(value.day).padStart(2, "0")
      model.value = `${year}-${month}-${day}`
    }
    isOpen.value = false
  },
})

// Format display text - reactive to locale changes
const displayText = computed(() => {
  if (!dateValue.value) return props.placeholder
  const df = new DateFormatter(props.locale, { dateStyle: "long" })
  return df.format(dateValue.value.toDate(getLocalTimeZone()))
})

const clearDate = (e: MouseEvent) => {
  e.stopPropagation()
  e.preventDefault()
  model.value = null
  isOpen.value = false
  emit("cleared")
}
</script>

<template>
  <div class="relative">
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          :disabled="disabled"
          :class="cn(
            'w-full justify-start text-left font-normal',
            !model && 'text-muted-foreground',
            clearable && model && 'pr-10',
            props.class,
          )"
        >
          <CalendarIcon class="mr-2 size-4" />
          <span class="flex-1">{{ displayText }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0">
        <Calendar v-model="dateValue" :locale="locale" :placeholder="dateValue" />
      </PopoverContent>
    </Popover>
    <button
      v-if="clearable && model && !disabled"
      type="button"
      class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      @click="clearDate"
    >
      <X class="size-4" />
    </button>
  </div>
</template>
