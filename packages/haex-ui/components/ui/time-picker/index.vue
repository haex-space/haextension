<template>
  <div class="flex gap-2">
    <ShadcnSelect :model-value="selectedHour" @update:model-value="updateHour">
      <ShadcnSelectTrigger class="w-[5rem]">
        <ShadcnSelectValue :placeholder="t('hour')" />
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
      <ShadcnSelectTrigger class="w-[5rem]">
        <ShadcnSelectValue :placeholder="t('minute')" />
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

const model = defineModel<string>({ default: "09:00" });

const { t } = useI18n();

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

const selectedHour = computed(() => model.value?.split(":")[0] ?? "09");
const selectedMinute = computed(() => model.value?.split(":")[1] ?? "00");

function updateHour(value: AcceptableValue) {
  model.value = `${String(value)}:${selectedMinute.value}`;
}

function updateMinute(value: AcceptableValue) {
  model.value = `${selectedHour.value}:${String(value)}`;
}
</script>

<i18n lang="yaml">
de:
  hour: Std
  minute: Min
en:
  hour: Hr
  minute: Min
</i18n>
