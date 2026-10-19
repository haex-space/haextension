<template>
  <div class="space-y-3">
    <!-- Frequency -->
    <div class="space-y-1.5">
      <ShadcnSelect v-model="freq">
        <ShadcnSelectTrigger>
          <ShadcnSelectValue />
        </ShadcnSelectTrigger>
        <ShadcnSelectContent>
          <ShadcnSelectItem value="none">{{ t("frequency.none") }}</ShadcnSelectItem>
          <ShadcnSelectItem value="daily">{{ t("frequency.daily") }}</ShadcnSelectItem>
          <ShadcnSelectItem value="weekly">{{ t("frequency.weekly") }}</ShadcnSelectItem>
          <ShadcnSelectItem value="monthly">{{ t("frequency.monthly") }}</ShadcnSelectItem>
          <ShadcnSelectItem value="yearly">{{ t("frequency.yearly") }}</ShadcnSelectItem>
        </ShadcnSelectContent>
      </ShadcnSelect>
    </div>

    <template v-if="freq !== 'none'">
      <!-- Interval -->
      <div class="flex items-center gap-2">
        <span class="text-sm">{{ t("interval.every") }}</span>
        <input
          v-model.number="interval"
          type="number"
          min="1"
          class="w-16 bg-muted rounded-md px-2 py-1.5 outline-none focus:ring-2 ring-primary text-sm"
        >
        <span class="text-sm">{{ t(`interval.unit.${freq}`, interval) }}</span>
      </div>

      <!-- Weekly: weekday picker -->
      <div v-if="freq === 'weekly'" class="space-y-1.5">
        <label class="text-sm font-medium">{{ t("weekdays.label") }}</label>
        <div class="flex gap-1 flex-wrap">
          <button
            v-for="(label, idx) in weekdayLabels"
            :key="idx"
            type="button"
            :class="[
              'w-9 h-9 rounded-full text-xs font-medium transition-colors',
              byweekday.includes(idx)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/70',
            ]"
            @click="toggleWeekday(idx)"
          >
            {{ label }}
          </button>
        </div>
      </div>

      <!-- Monthly: day of month -->
      <div v-if="freq === 'monthly'" class="flex items-center gap-2">
        <span class="text-sm">{{ t("monthday.onDay") }}</span>
        <input
          v-model.number="bymonthday"
          type="number"
          min="1"
          max="31"
          class="w-16 bg-muted rounded-md px-2 py-1.5 outline-none focus:ring-2 ring-primary text-sm"
        >
      </div>

      <!-- End condition -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t("end.label") }}</label>
        <ShadcnSelect v-model="endMode">
          <ShadcnSelectTrigger>
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="never">{{ t("end.never") }}</ShadcnSelectItem>
            <ShadcnSelectItem value="count">{{ t("end.count") }}</ShadcnSelectItem>
            <ShadcnSelectItem value="until">{{ t("end.until") }}</ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>

        <div v-if="endMode === 'count'" class="flex items-center gap-2 pt-1">
          <span class="text-sm">{{ t("end.after") }}</span>
          <input
            v-model.number="count"
            type="number"
            min="1"
            class="w-16 bg-muted rounded-md px-2 py-1.5 outline-none focus:ring-2 ring-primary text-sm"
          >
          <span class="text-sm">{{ t("end.occurrences", count) }}</span>
        </div>

        <input
          v-if="endMode === 'until'"
          v-model="until"
          type="date"
          class="bg-muted rounded-md px-2 py-1.5 outline-none focus:ring-2 ring-primary text-sm"
        >
      </div>

      <!-- Live preview -->
      <div v-if="previewDates.length" class="text-xs text-muted-foreground">
        {{ t("preview.label") }}: {{ previewDates.join(", ") }}<span v-if="previewMore">, …</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { formToRule, ruleToForm, type RecurrenceForm } from "~/lib/recurrenceForm";
import { firstOccurrences, parseRRule, type Frequency } from "~/lib/rrule";

const props = defineProps<{
  /** Sample start date used for the preview and weekday/monthday defaults. */
  dtstart?: Date | null;
}>();

/** v-model: the stored RRULE body ("" / no value = no recurrence). */
const model = defineModel<string | null>({ default: null });

const { t, locale } = useI18n();

type FreqOrNone = "none" | Frequency;

const freq = ref<FreqOrNone>("none");
const interval = ref(1);
const byweekday = ref<number[]>([]); // 0 = Monday … 6 = Sunday (rrule.js convention)
const bymonthday = ref<number | null>(null);
const endMode = ref<"never" | "count" | "until">("never");
const count = ref(10);
const until = ref(""); // yyyy-mm-dd

const sampleStart = computed(() => props.dtstart ?? new Date());

// Monday-first weekday labels matching rrule.js weekday order (MO=0).
const weekdayLabels = computed(() => {
  const base = new Date(Date.UTC(2024, 0, 1)); // a Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return new Intl.DateTimeFormat(locale.value, { weekday: "short", timeZone: "UTC" }).format(d);
  });
});

function toggleWeekday(idx: number) {
  byweekday.value = byweekday.value.includes(idx)
    ? byweekday.value.filter((d) => d !== idx)
    : [...byweekday.value, idx].sort((a, b) => a - b);
}

function currentForm(): RecurrenceForm {
  return {
    freq: freq.value,
    interval: interval.value,
    byweekday: [...byweekday.value],
    bymonthday: bymonthday.value,
    endMode: endMode.value,
    count: count.value,
    until: until.value,
  };
}

// The rule as loaded, so unedited parts are written back unchanged.
let loaded: { rule: string | null; form: RecurrenceForm } = { rule: null, form: ruleToForm(null) };

/**
 * Populate the form from the model. Runs on mount and whenever the parent
 * replaces the rule (e.g. once the edited event has been loaded), so the
 * form never writes a stale rule back.
 */
function loadFromModel(rule: string | null | undefined) {
  const form = ruleToForm(rule);
  loaded = { rule: form.freq === "none" ? null : (rule ?? null), form };
  freq.value = form.freq;
  interval.value = form.interval;
  byweekday.value = form.byweekday;
  bymonthday.value = form.bymonthday;
  endMode.value = form.endMode;
  count.value = form.count;
  until.value = form.until;
}

const previewDates = ref<string[]>([]);
const previewMore = ref(false);

function refreshPreview() {
  const options = model.value ? parseRRule(model.value) : null;
  if (!options) {
    previewDates.value = [];
    return;
  }
  const dates = firstOccurrences(options, sampleStart.value, 5);
  previewMore.value = endMode.value === "never" || dates.length === 5;
  const fmt = new Intl.DateTimeFormat(locale.value, { day: "2-digit", month: "2-digit" });
  previewDates.value = dates.map((d) => fmt.format(d));
}

loadFromModel(model.value);
refreshPreview();

watch(model, (rule) => {
  if (rule !== formToRule(currentForm(), loaded)) loadFromModel(rule);
  refreshPreview();
});

// Only user edits write the model; loading the form reproduces the same rule.
watch(
  [freq, interval, byweekday, bymonthday, endMode, count, until],
  () => {
    const rule = formToRule(currentForm(), loaded);
    if (rule !== (model.value ?? null)) model.value = rule;
  },
  { deep: true },
);

watch(sampleStart, refreshPreview);
</script>

<i18n lang="yaml">
de:
  frequency:
    none: Keine Wiederholung
    daily: Täglich
    weekly: Wöchentlich
    monthly: Monatlich
    yearly: Jährlich
  interval:
    every: Alle
    unit:
      daily: Tag(e)
      weekly: Woche(n)
      monthly: Monat(e)
      yearly: Jahr(e)
  weekdays:
    label: An Wochentagen
  monthday:
    onDay: Am Tag
  end:
    label: Endet
    never: Nie
    count: Nach Anzahl
    until: An Datum
    after: Nach
    occurrences: "Mal | Mal"
  preview:
    label: "Nächste Termine"
en:
  frequency:
    none: No recurrence
    daily: Daily
    weekly: Weekly
    monthly: Monthly
    yearly: Yearly
  interval:
    every: Every
    unit:
      daily: day(s)
      weekly: week(s)
      monthly: month(s)
      yearly: year(s)
  weekdays:
    label: On weekdays
  monthday:
    onDay: On day
  end:
    label: Ends
    never: Never
    count: After count
    until: On date
    after: After
    occurrences: "time | times"
  preview:
    label: "Next dates"
</i18n>
