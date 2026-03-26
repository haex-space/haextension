<script setup lang="ts">
import type { CalendarRootEmits, CalendarRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { DateValue } from "@internationalized/date"
import { CalendarDate } from "@internationalized/date"
import { reactiveOmit } from "@vueuse/core"
import { CalendarRoot, useForwardPropsEmits } from "reka-ui"
import { cn } from "@/lib/utils"

import CalendarCell from "./Cell.vue"
import CalendarCellTrigger from "./CellTrigger.vue"
import CalendarGrid from "./Grid.vue"
import CalendarGridBody from "./GridBody.vue"
import CalendarGridHead from "./GridHead.vue"
import CalendarGridRow from "./GridRow.vue"
import CalendarHeadCell from "./HeadCell.vue"
import CalendarHeader from "./Header.vue"
import CalendarNextButton from "./NextButton.vue"
import CalendarPrevButton from "./PrevButton.vue"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select"

const props = defineProps<CalendarRootProps & { class?: HTMLAttributes["class"]; showWeekNumbers?: boolean }>()
const emits = defineEmits<CalendarRootEmits>()

const delegatedProps = reactiveOmit(props, "class", "placeholder", "showWeekNumbers")

function getISOWeekNumber(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
const forwarded = useForwardPropsEmits(delegatedProps, emits)

// Internal placeholder state for navigation
const today = new Date()
const internalPlaceholder = ref(
  props.placeholder ?? new CalendarDate(today.getFullYear(), today.getMonth() + 1, today.getDate())
)

// Sync with external placeholder if provided
watch(() => props.placeholder, (newPlaceholder) => {
  if (newPlaceholder) {
    internalPlaceholder.value = newPlaceholder
  }
})

// Generate year options (current year - 100 to current year + 100)
const currentYear = new Date().getFullYear()
const years = Array.from({ length: 201 }, (_, i) => currentYear - 100 + i)

// Get localized month names - cached by locale
const monthNamesCache = new Map<string, Array<{ value: number; label: string }>>()
const getMonthNames = (locale: string) => {
  if (monthNamesCache.has(locale)) {
    return monthNamesCache.get(locale)!
  }
  const formatter = new Intl.DateTimeFormat(locale, { month: "long" })
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(2024, i, 1)
    return {
      value: i + 1,
      label: formatter.format(date),
    }
  })
  monthNamesCache.set(locale, months)
  return months
}

// Helper to update month
const handleMonthChange = (value: unknown) => {
  if (value === null || typeof value !== "string") return
  const month = Number(value)
  internalPlaceholder.value = internalPlaceholder.value.set({ month })
}

// Helper to update year
const handleYearChange = (value: unknown) => {
  if (value === null || typeof value !== "string") return
  const year = Number(value)
  internalPlaceholder.value = internalPlaceholder.value.set({ year })
}
</script>

<template>
  <CalendarRoot
    v-slot="{ grid, weekDays, locale }"
    data-slot="calendar"
    :class="cn('p-3', props.class)"
    :placeholder="(internalPlaceholder as DateValue)"
    v-bind="forwarded"
    @update:placeholder="(v) => internalPlaceholder = v"
  >
    <CalendarHeader>
      <CalendarPrevButton />
      <div class="flex items-center gap-1">
        <Select
          :model-value="String(internalPlaceholder.month)"
          @update:model-value="handleMonthChange"
        >
          <SelectTrigger aria-label="Select month" class="h-7 w-auto gap-1 border-none p-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="max-h-[200px]">
            <SelectItem
              v-for="month in getMonthNames(locale)"
              :key="month.value"
              :value="String(month.value)"
            >
              {{ month.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          :model-value="String(internalPlaceholder.year)"
          @update:model-value="handleYearChange"
        >
          <SelectTrigger aria-label="Select year" class="h-7 w-auto gap-1 border-none p-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="max-h-[200px]">
            <SelectItem
              v-for="year in years"
              :key="year"
              :value="String(year)"
            >
              {{ year }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CalendarNextButton />
    </CalendarHeader>

    <div class="mt-4 flex flex-col gap-y-4 sm:flex-row sm:gap-x-4 sm:gap-y-0">
      <CalendarGrid v-for="month in grid" :key="month.value.toString()">
        <CalendarGridHead>
          <CalendarGridRow>
            <th v-if="props.showWeekNumbers" class="flex items-center justify-center w-6 text-muted-foreground/60 text-[0.7rem] font-normal">KW</th>
            <CalendarHeadCell v-for="day in weekDays" :key="day">
              {{ day }}
            </CalendarHeadCell>
          </CalendarGridRow>
        </CalendarGridHead>
        <CalendarGridBody>
          <CalendarGridRow v-for="(weekDates, index) in month.rows" :key="`weekDate-${index}`">
            <td v-if="props.showWeekNumbers" class="flex items-center justify-center w-6 text-muted-foreground/60 text-[0.7rem] font-mono">
              {{ getISOWeekNumber(weekDates[0]!.year, weekDates[0]!.month, weekDates[0]!.day) }}
            </td>
            <CalendarCell v-for="weekDate in weekDates" :key="weekDate.toString()" :date="weekDate">
              <CalendarCellTrigger :day="weekDate" :month="month.value" />
            </CalendarCell>
          </CalendarGridRow>
        </CalendarGridBody>
      </CalendarGrid>
    </div>
  </CalendarRoot>
</template>
