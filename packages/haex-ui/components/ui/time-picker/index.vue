<template>
  <div class="flex gap-2">
    <ShadcnSelect :model-value="selectedHour" @update:model-value="updateHour">
      <ShadcnSelectTrigger class="w-[5rem]" :aria-label="labels.hour">
        <ShadcnSelectValue :placeholder="labels.hour" />
      </ShadcnSelectTrigger>
      <ShadcnSelectContent>
        <ShadcnSelectItem
          v-for="option in hourOptions"
          :key="option"
          :value="option"
        >
          {{ option }}
        </ShadcnSelectItem>
      </ShadcnSelectContent>
    </ShadcnSelect>

    <span class="flex items-center text-muted-foreground">:</span>

    <ShadcnSelect :model-value="selectedMinute" @update:model-value="updateMinute">
      <ShadcnSelectTrigger class="w-[5rem]" :aria-label="labels.minute">
        <ShadcnSelectValue :placeholder="labels.minute" />
      </ShadcnSelectTrigger>
      <ShadcnSelectContent>
        <ShadcnSelectItem
          v-for="option in minuteOptions"
          :key="option"
          :value="option"
        >
          {{ option }}
        </ShadcnSelectItem>
      </ShadcnSelectContent>
    </ShadcnSelect>
  </div>
</template>

<script setup lang="ts">
import type { AcceptableValue } from "reka-ui";

export type UiTimePickerLabels = {
  hour: string;
  minute: string;
};

withDefaults(
  defineProps<{
    /** Select placeholders and accessible names. Defaults are German abbreviations. */
    labels?: UiTimePickerLabels;
  }>(),
  {
    labels: () => ({ hour: "Std", minute: "Min" }),
  },
);

const model = defineModel<string>({ default: "09:00" });

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const stepMinutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

const selectedHour = computed(() => model.value?.split(":")[0] ?? "09");
const selectedMinute = computed(() => model.value?.split(":")[1] ?? "00");

// Times set elsewhere (imported events) can lie between the 5-minute steps; keep them shown and selectable
const minuteOptions = computed(() =>
  stepMinutes.includes(selectedMinute.value) || !/^[0-5]\d$/.test(selectedMinute.value)
    ? stepMinutes
    : [...stepMinutes, selectedMinute.value].sort(),
);

function updateHour(value: AcceptableValue) {
  model.value = `${String(value)}:${selectedMinute.value}`;
}

function updateMinute(value: AcceptableValue) {
  model.value = `${selectedHour.value}:${String(value)}`;
}
</script>
