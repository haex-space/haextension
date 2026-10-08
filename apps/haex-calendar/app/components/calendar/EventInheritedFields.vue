<template>
  <!-- Reminders -->
  <div>
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium">{{ t('fields.reminders') }}</label>
      <span
        v-if="hasType"
        class="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
      >
        {{ remindersOverridden ? t('inherited.overridden') : t('inherited.inherited') }}
      </span>
    </div>
    <div v-if="hasType && !remindersOverridden" class="mt-1 space-y-1">
      <p class="text-sm text-muted-foreground">
        {{ inheritedRemindersLabel || t('reminders.none') }}
      </p>
      <button type="button" class="text-sm text-primary hover:opacity-80" @click="startOverrideReminders">
        {{ t('inherited.customize') }}
      </button>
    </div>
    <div v-else class="mt-1 space-y-2">
      <CalendarRemindersEditor v-model="reminderOffsets" />
      <button
        v-if="hasType"
        type="button"
        class="text-sm text-muted-foreground hover:opacity-80"
        @click="resetReminders"
      >
        {{ t('inherited.reset') }}
      </button>
    </div>
  </div>

  <!-- Recurrence -->
  <div>
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium">{{ t('fields.recurrence') }}</label>
      <span
        v-if="hasType"
        class="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
      >
        {{ rruleOverride ? t('inherited.overridden') : t('inherited.inherited') }}
      </span>
    </div>
    <div v-if="hasType && !rruleOverride" class="mt-1 space-y-1">
      <p class="text-sm text-muted-foreground">
        {{ inheritedRecurrenceLabel || t('recurrence.none') }}
      </p>
      <button type="button" class="text-sm text-primary hover:opacity-80" @click="startOverrideRecurrence">
        {{ t('inherited.customize') }}
      </button>
    </div>
    <div v-else class="mt-1 space-y-2">
      <CalendarRecurrenceEditor v-model="rrule" :dtstart="dtstart" />
      <button
        v-if="hasType"
        type="button"
        class="text-sm text-muted-foreground hover:opacity-80"
        @click="resetRecurrence"
      >
        {{ t('inherited.reset') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatRemindersShort } from "~/lib/reminders";
import { rruleFrequency } from "~/lib/rrule";

const reminderOffsets = defineModel<number[]>("reminderOffsets", { default: () => [] });
/** UI flag: the event has its own reminders (overrides the type defaults). */
const remindersOverridden = defineModel<boolean>("remindersOverridden", { default: false });
const rrule = defineModel<string | null>("rrule", { default: null });
const rruleOverride = defineModel<boolean>("rruleOverride", { default: false });

const props = defineProps<{
  eventTypeId: string | null;
  /** Sample dtstart for the recurrence preview. */
  dtstart: Date;
}>();

const { t } = useI18n();
const eventTypesStore = useEventTypesStore();

const hasType = computed(() => !!props.eventTypeId);

const inheritedRemindersLabel = computed(() =>
  formatRemindersShort(eventTypesStore.getTypeReminders(props.eventTypeId)),
);

const inheritedRecurrenceLabel = computed(() => {
  const type = eventTypesStore.getType(props.eventTypeId);
  const freq = rruleFrequency(type?.defaultRrule);
  return freq ? t(`freq.${freq}`) : "";
});

function startOverrideReminders() {
  reminderOffsets.value = [...eventTypesStore.getTypeReminders(props.eventTypeId)];
  remindersOverridden.value = true;
}

function resetReminders() {
  reminderOffsets.value = [];
  remindersOverridden.value = false;
}

function startOverrideRecurrence() {
  const type = eventTypesStore.getType(props.eventTypeId);
  rrule.value = type?.defaultRrule ?? null;
  rruleOverride.value = true;
}

function resetRecurrence() {
  rrule.value = null;
  rruleOverride.value = false;
}
</script>

<i18n lang="yaml">
de:
  fields:
    reminders: Erinnerungen
    recurrence: Wiederholung
  inherited:
    inherited: geerbt
    overridden: überschrieben
    customize: Anpassen
    reset: Auf Default zurücksetzen
  reminders:
    none: Keine Erinnerungen
  recurrence:
    none: Keine Wiederholung
  freq:
    daily: täglich
    weekly: wöchentlich
    monthly: monatlich
    yearly: jährlich
en:
  fields:
    reminders: Reminders
    recurrence: Recurrence
  inherited:
    inherited: inherited
    overridden: overridden
    customize: Customize
    reset: Reset to default
  reminders:
    none: No reminders
  recurrence:
    none: No recurrence
  freq:
    daily: daily
    weekly: weekly
    monthly: monthly
    yearly: yearly
</i18n>
