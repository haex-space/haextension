<template>
  <div class="h-screen flex flex-col bg-background text-foreground">
    <!-- Header -->
    <header class="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      <button
        class="p-1.5 rounded-md hover:bg-muted transition-colors"
        @click="router.push('/')"
      >
        <ArrowLeft class="w-5 h-5" />
      </button>
      <h1 class="text-lg font-semibold">{{ t('title') }}</h1>
    </header>

    <!-- Settings content -->
    <div class="flex-1 overflow-y-auto p-6 max-w-lg mx-auto w-full space-y-8">
      <!-- Section: Display -->
      <section class="space-y-4">
        <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{{ t('sections.display') }}</h2>

        <!-- Default view -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('defaultView.label') }}</label>
          <ShadcnSelect v-model="settings.defaultView">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="month">{{ t('defaultView.month') }}</ShadcnSelectItem>
              <ShadcnSelectItem value="week">{{ t('defaultView.week') }}</ShadcnSelectItem>
              <ShadcnSelectItem value="day">{{ t('defaultView.day') }}</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
          <p class="text-xs text-muted-foreground">{{ t('defaultView.description') }}</p>
        </div>

        <!-- Week start -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('weekStart.label') }}</label>
          <ShadcnSelect v-model="settings.weekStart">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="monday">{{ t('weekStart.monday') }}</ShadcnSelectItem>
              <ShadcnSelectItem value="sunday">{{ t('weekStart.sunday') }}</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <!-- Default event duration -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('eventDuration.label') }}</label>
          <ShadcnSelect v-model="eventDurationStr">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="15">15 {{ t('eventDuration.minutes') }}</ShadcnSelectItem>
              <ShadcnSelectItem value="30">30 {{ t('eventDuration.minutes') }}</ShadcnSelectItem>
              <ShadcnSelectItem value="60">1 {{ t('eventDuration.hour') }}</ShadcnSelectItem>
              <ShadcnSelectItem value="120">2 {{ t('eventDuration.hours') }}</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>
      </section>

      <!-- Section: View Options -->
      <section class="space-y-4">
        <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{{ t('sections.viewOptions') }}</h2>

        <label class="flex items-center gap-3 cursor-pointer">
          <ShadcnCheckbox v-model="settings.showWeekends" />
          <span class="text-sm">{{ t('viewOptions.showWeekends') }}</span>
        </label>

        <label class="flex items-center gap-3 cursor-pointer">
          <ShadcnCheckbox v-model="settings.showDeclinedEvents" />
          <span class="text-sm">{{ t('viewOptions.showDeclinedEvents') }}</span>
        </label>

        <label class="flex items-center gap-3 cursor-pointer">
          <ShadcnCheckbox v-model="settings.showCompletedTasks" />
          <span class="text-sm">{{ t('viewOptions.showCompletedTasks') }}</span>
        </label>

        <label class="flex items-center gap-3 cursor-pointer">
          <ShadcnCheckbox v-model="settings.showWeekNumbers" />
          <span class="text-sm">{{ t('viewOptions.showWeekNumbers') }}</span>
        </label>

        <label class="flex items-center gap-3 cursor-pointer">
          <ShadcnCheckbox v-model="settings.shorterEvents" />
          <span class="text-sm">{{ t('viewOptions.shorterEvents') }}</span>
        </label>

        <label class="flex items-center gap-3 cursor-pointer">
          <ShadcnCheckbox v-model="settings.dimPastEvents" />
          <span class="text-sm">{{ t('viewOptions.dimPastEvents') }}</span>
        </label>

        <label class="flex items-center gap-3 cursor-pointer">
          <ShadcnCheckbox v-model="settings.sideBySideDayView" />
          <span class="text-sm">{{ t('viewOptions.sideBySideDayView') }}</span>
        </label>
      </section>

      <!-- Section: Regional -->
      <section class="space-y-4">
        <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{{ t('sections.regional') }}</h2>

        <!-- Language -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('language.label') }}</label>
          <ShadcnSelect v-model="settings.locale">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="de">Deutsch</ShadcnSelectItem>
              <ShadcnSelectItem value="en">English</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <!-- Time format -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('timeFormat.label') }}</label>
          <ShadcnSelect v-model="settings.timeFormat">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="24h">24h (14:30)</ShadcnSelectItem>
              <ShadcnSelectItem value="12h">12h (2:30 PM)</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <!-- Date format -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('dateFormat.label') }}</label>
          <ShadcnSelect v-model="settings.dateFormat">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="dd.MM.yyyy">DD.MM.YYYY (31.12.2026)</ShadcnSelectItem>
              <ShadcnSelectItem value="MM/dd/yyyy">MM/DD/YYYY (12/31/2026)</ShadcnSelectItem>
              <ShadcnSelectItem value="yyyy-MM-dd">YYYY-MM-DD (2026-12-31)</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <!-- Timezone -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('timezone.label') }}</label>
          <ShadcnSelect v-model="settings.timezone">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent class="max-h-[200px]">
              <ShadcnSelectItem
                v-for="tz in timezones"
                :key="tz"
                :value="tz"
              >
                {{ tz }}
              </ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
          <p class="text-xs text-muted-foreground">{{ t('timezone.description') }}</p>
        </div>
      </section>

      <!-- Section: Event Types ("Termin-Arten") -->
      <section class="space-y-4">
        <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{{ t('eventTypes.title') }}</h2>
        <CalendarEventTypesSettings />
      </section>

      <!-- Section: External Calendars -->
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{{ t('external.title') }}</h2>
          <button
            v-if="caldavAccounts.accounts.length > 0"
            class="flex items-center gap-1.5 text-sm text-primary hover:opacity-80 disabled:opacity-50"
            :disabled="caldavSync.isSyncing"
            @click="syncAll"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': caldavSync.isSyncing }" />
            {{ t('external.syncAll') }}
          </button>
        </div>

        <!-- Account list -->
        <div
          v-for="account in caldavAccounts.accounts"
          :key="account.id"
          class="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted"
        >
          <Cloud class="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ account.name }}</p>
            <p class="text-xs text-muted-foreground truncate">{{ account.serverUrl }}</p>
            <p class="text-xs text-muted-foreground">
              {{ account.lastSyncAt ? t('external.lastSync', { time: formatSyncTime(account.lastSyncAt) }) : t('external.neverSynced') }}
            </p>
          </div>
          <button
            class="p-1.5 rounded-md hover:bg-background transition-colors text-destructive shrink-0"
            :title="t('external.delete')"
            @click="confirmDelete(account.id)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>

        <!-- Empty state -->
        <p v-if="caldavAccounts.accounts.length === 0" class="text-sm text-muted-foreground">
          {{ t('external.empty') }}
        </p>

        <!-- Add button -->
        <button
          class="flex items-center gap-2 w-full justify-center bg-muted hover:bg-muted/80 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          @click="showCaldavDialog = true"
        >
          <Plus class="w-4 h-4" />
          {{ t('external.add') }}
        </button>
      </section>
    </div>

    <!-- CalDAV Account Dialog -->
    <CalendarCaldavAccountDialog v-model:open="showCaldavDialog" />

    <!-- Delete account confirmation -->
    <ShadcnAlertDialog v-model:open="showDeleteConfirm">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{ t('external.deleteConfirm.title') }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>{{ t('external.deleteConfirm.description') }}</ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t('external.deleteConfirm.abort') }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="executeDelete">{{ t('external.deleteConfirm.confirm') }}</ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, Cloud, Plus, RefreshCw, Trash2 } from "lucide-vue-next";
import type { DefaultEventDuration } from "~/stores/settings";

const { t, locale } = useI18n();
const router = useRouter();
const settings = useSettingsStore();
const caldavAccounts = useCaldavAccountsStore();
const caldavSync = useCaldavSyncStore();
const calendarsStore = useCalendarsStore();

const eventDurationStr = computed({
  get: () => String(settings.defaultEventDuration),
  set: (value: string) => {
    settings.defaultEventDuration = Number(value) as DefaultEventDuration;
  },
});

const timezones = Intl.supportedValuesOf("timeZone");

// --- External calendars (CalDAV accounts) ---
const showCaldavDialog = ref(false);
const showDeleteConfirm = ref(false);
const deleteAccountId = ref<string | null>(null);

onMounted(() => {
  caldavAccounts.loadAccountsAsync();
});

function formatSyncTime(date: Date) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: "short", timeStyle: "short" }).format(date);
}

async function syncAll() {
  await caldavSync.syncAllRemoteCalendarsAsync();
  await caldavAccounts.loadAccountsAsync();
}

function confirmDelete(id: string) {
  deleteAccountId.value = id;
  showDeleteConfirm.value = true;
}

async function executeDelete() {
  if (!deleteAccountId.value) return;
  await caldavAccounts.deleteAccountAsync(deleteAccountId.value);
  await calendarsStore.loadCalendarsAsync();
  deleteAccountId.value = null;
  showDeleteConfirm.value = false;
}
</script>

<i18n lang="yaml">
de:
  title: Einstellungen
  sections:
    display: Anzeige
    viewOptions: Ansichtsoptionen
    regional: Regional
  viewOptions:
    showWeekends: Wochenenden anzeigen
    showDeclinedEvents: Abgelehnte Termine anzeigen
    showCompletedTasks: Erledigte Aufgaben anzeigen
    showWeekNumbers: Kalenderwochen anzeigen
    shorterEvents: Kürzere Termine als 30-minütiges Intervall anzeigen
    dimPastEvents: Vergangene Termine abgeschwächt anzeigen
    sideBySideDayView: Kalender in der Tagesansicht nebeneinander anzeigen
  defaultView:
    label: Standard-Ansicht
    description: Ansicht die beim Öffnen des Kalenders angezeigt wird
    month: Monat
    week: Woche
    day: Tag
  weekStart:
    label: Wochenstart
    monday: Montag
    sunday: Sonntag
  eventDuration:
    label: Standard-Eventdauer
    minutes: Minuten
    hour: Stunde
    hours: Stunden
  language:
    label: Sprache
  timeFormat:
    label: Zeitformat
  dateFormat:
    label: Datumsformat
  timezone:
    label: Zeitzone
    description: Wird für neue Events verwendet
  eventTypes:
    title: Termin-Arten
  external:
    title: Externe Kalender
    add: CalDAV-Konto verbinden
    syncAll: Synchronisieren
    empty: Noch keine externen Kalender verbunden.
    lastSync: "Zuletzt synchronisiert: {time}"
    neverSynced: Noch nicht synchronisiert
    delete: Konto entfernen
    deleteConfirm:
      title: Konto entfernen?
      description: Das Konto und alle zugehörigen Kalender und Termine werden lokal gelöscht. Das gespeicherte Passwort wird aus dem Passwortmanager entfernt.
      abort: Abbrechen
      confirm: Entfernen
en:
  title: Settings
  sections:
    display: Display
    viewOptions: View Options
    regional: Regional
  viewOptions:
    showWeekends: Show weekends
    showDeclinedEvents: Show declined events
    showCompletedTasks: Show completed tasks
    showWeekNumbers: Show week numbers
    shorterEvents: Show shorter events as 30-minute interval
    dimPastEvents: Dim past events
    sideBySideDayView: Show calendars side by side in day view
  defaultView:
    label: Default view
    description: View shown when opening the calendar
    month: Month
    week: Week
    day: Day
  weekStart:
    label: Week start
    monday: Monday
    sunday: Sunday
  eventDuration:
    label: Default event duration
    minutes: minutes
    hour: hour
    hours: hours
  language:
    label: Language
  timeFormat:
    label: Time format
  dateFormat:
    label: Date format
  timezone:
    label: Timezone
    description: Used for new events
  eventTypes:
    title: Event Types
  external:
    title: External Calendars
    add: Connect CalDAV Account
    syncAll: Sync
    empty: No external calendars connected yet.
    lastSync: "Last synced: {time}"
    neverSynced: Not synced yet
    delete: Remove account
    deleteConfirm:
      title: Remove account?
      description: The account and all associated calendars and events will be deleted locally. The stored password will be removed from the password manager.
      abort: Cancel
      confirm: Remove
</i18n>
