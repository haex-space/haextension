<template>
  <div class="space-y-2">
    <div
      v-for="(row, idx) in rows"
      :key="idx"
      class="flex items-center gap-2"
    >
      <input
        v-model.number="row.value"
        type="number"
        min="0"
        class="w-16 bg-muted rounded-md px-2 py-1.5 outline-none focus:ring-2 ring-primary text-sm"
        @input="emitOffsets"
      >
      <ShadcnSelect :model-value="row.unit" @update:model-value="(u) => setUnit(idx, u as ReminderUnit)">
        <ShadcnSelectTrigger class="flex-1">
          <ShadcnSelectValue />
        </ShadcnSelectTrigger>
        <ShadcnSelectContent>
          <ShadcnSelectItem v-for="u in units" :key="u" :value="u">
            {{ t(`unit.${u}`) }}
          </ShadcnSelectItem>
        </ShadcnSelectContent>
      </ShadcnSelect>
      <button
        type="button"
        class="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
        :title="t('remove')"
        @click="removeRow(idx)"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <button
      type="button"
      class="flex items-center gap-1.5 text-sm text-primary hover:opacity-80"
      @click="addRow"
    >
      <Plus class="w-4 h-4" />
      {{ t("add") }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { Plus, X } from "lucide-vue-next";
import {
  REMINDER_UNITS,
  minutesToOffset,
  offsetToMinutes,
  type ReminderUnit,
} from "~/lib/reminders";

/** v-model: reminder offsets in minutes-before-event. */
const model = defineModel<number[]>({ default: () => [] });

const { t } = useI18n();
const units = REMINDER_UNITS;

type Row = { value: number; unit: ReminderUnit };

const rows = ref<Row[]>([]);

function syncFromModel(offsets: number[]) {
  rows.value = offsets.map((m) => minutesToOffset(m));
}
syncFromModel(model.value ?? []);

// Re-sync only when the incoming offsets actually differ from what the rows
// represent (avoids clobbering in-progress edits on every keystroke echo).
watch(model, (offsets) => {
  const current = rows.value.map((r) => offsetToMinutes(r.value, r.unit));
  const next = offsets ?? [];
  if (current.length !== next.length || current.some((m, i) => m !== next[i])) {
    syncFromModel(next);
  }
});

function emitOffsets() {
  model.value = rows.value.map((r) => offsetToMinutes(r.value, r.unit));
}

function setUnit(idx: number, unit: ReminderUnit) {
  const row = rows.value[idx];
  if (!row) return;
  row.unit = unit;
  emitOffsets();
}

function addRow() {
  rows.value.push({ value: 1, unit: "day" });
  emitOffsets();
}

function removeRow(idx: number) {
  rows.value.splice(idx, 1);
  emitOffsets();
}
</script>

<i18n lang="yaml">
de:
  add: Erinnerung hinzufügen
  remove: Entfernen
  unit:
    minute: Minuten vorher
    hour: Stunden vorher
    day: Tage vorher
    week: Wochen vorher
en:
  add: Add reminder
  remove: Remove
  unit:
    minute: minutes before
    hour: hours before
    day: days before
    week: weeks before
</i18n>
