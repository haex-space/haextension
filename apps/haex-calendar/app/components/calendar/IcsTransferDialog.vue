<template>
  <UiDrawerModal v-model:open="isOpen" :title="mode === 'import' ? t('import.title') : t('export.title')">
    <template #content>
      <div class="space-y-2 p-4">
        <label class="text-sm font-medium">{{ t('calendar') }}</label>
        <ShadcnSelect v-model="calendarId">
          <ShadcnSelectTrigger class="mt-1">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem v-for="cal in calendarsStore.calendars" :key="cal.id" :value="cal.id">
              <span class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: cal.color }" />
                {{ cal.name }}
              </span>
            </ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept=".ics,.ical"
        class="hidden"
        @change="onFileSelected"
      >
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <button class="text-muted-foreground px-3 py-2" @click="isOpen = false">
          {{ t('cancel') }}
        </button>
        <button
          class="bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="!calendarId || isBusy"
          @click="confirm"
        >
          {{ mode === 'import' ? t('import.chooseFile') : t('export.confirm') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";
import { getErrorMessage } from "~/lib/errors";

const props = defineProps<{ mode: "import" | "export" }>();
const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const calendarsStore = useCalendarsStore();
const { importFileAsync, exportCalendarAsync } = useIcal();

const calendarId = ref("");
const isBusy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

watch(isOpen, (open) => {
  if (open) calendarId.value = calendarsStore.calendars[0]?.id ?? "";
});

async function confirm() {
  if (props.mode === "import") {
    fileInput.value?.click();
    return;
  }
  const calendar = calendarsStore.getCalendar(calendarId.value);
  if (!calendar) return;
  isBusy.value = true;
  try {
    await exportCalendarAsync(calendar.id, calendar.name);
    isOpen.value = false;
  } catch (error) {
    toast.error(t("export.failed"), { description: getErrorMessage(error) });
  } finally {
    isBusy.value = false;
  }
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !calendarId.value) return;

  isBusy.value = true;
  try {
    const result = await importFileAsync(file, calendarId.value);
    toast.success(t("import.done", result));
    isOpen.value = false;
  } catch (error) {
    toast.error(t("import.failed"), { description: getErrorMessage(error) });
  } finally {
    isBusy.value = false;
    // Allow picking the same file again after a failure.
    input.value = "";
  }
}
</script>

<i18n lang="yaml">
de:
  calendar: Kalender
  cancel: Abbrechen
  import:
    title: Termine importieren (.ics)
    chooseFile: Datei wählen
    done: "{imported} neu, {updated} aktualisiert, {skipped} übersprungen"
    failed: Import fehlgeschlagen
  export:
    title: Kalender exportieren (.ics)
    confirm: Exportieren
    failed: Export fehlgeschlagen
en:
  calendar: Calendar
  cancel: Cancel
  import:
    title: Import events (.ics)
    chooseFile: Choose file
    done: "{imported} new, {updated} updated, {skipped} skipped"
    failed: Import failed
  export:
    title: Export calendar (.ics)
    confirm: Export
    failed: Export failed
</i18n>
