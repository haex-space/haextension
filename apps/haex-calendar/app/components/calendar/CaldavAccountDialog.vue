<template>
  <UiDrawerModal v-model:open="isOpen" :title="t(step === 'connect' ? 'title.connect' : 'title.select')">
    <template #content>
      <div class="space-y-4 p-4">
        <!-- Phase 1: Connection form -->
        <template v-if="step === 'connect'">
          <div>
            <label class="text-sm font-medium">{{ t('fields.name') }}</label>
            <input
              ref="nameInput"
              v-model="form.name"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
              :placeholder="t('fields.namePlaceholder')"
            >
          </div>
          <div>
            <label class="text-sm font-medium">{{ t('fields.serverUrl') }}</label>
            <input
              v-model="form.serverUrl"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
              :placeholder="t('fields.serverUrlPlaceholder')"
            >
          </div>
          <div>
            <label class="text-sm font-medium">{{ t('fields.username') }}</label>
            <input
              v-model="form.username"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
            >
          </div>
          <div>
            <label class="text-sm font-medium">{{ t('fields.password') }}</label>
            <input
              v-model="form.password"
              type="password"
              class="w-full mt-1 bg-muted rounded-md px-3 py-2 outline-none focus:ring-2 ring-primary"
              @keydown.enter="handleConnect"
            >
          </div>
        </template>

        <!-- Phase 2: Calendar selection -->
        <template v-else-if="step === 'select'">
          <p class="text-sm text-muted-foreground">{{ t('selectDescription') }}</p>
          <div class="space-y-2">
            <label
              v-for="cal in discoveredCalendars"
              :key="cal.path"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 cursor-pointer"
            >
              <ShadcnCheckbox
                :model-value="selectedPaths.has(cal.path)"
                @update:model-value="toggleCalendar(cal.path)"
              />
              <span
                class="w-3 h-3 rounded-full shrink-0"
                :style="{ backgroundColor: cal.color || '#3b82f6' }"
              />
              <span class="text-sm flex-1 truncate">{{ cal.displayName }}</span>
            </label>
          </div>
        </template>

        <!-- Loading spinner -->
        <div v-if="isProcessing" class="flex items-center justify-center py-4">
          <Loader2 class="w-5 h-5 animate-spin text-primary" />
          <span class="ml-2 text-sm text-muted-foreground">{{ t(step === 'connect' ? 'discovering' : 'subscribing') }}</span>
        </div>

        <!-- Error -->
        <p v-if="errorMessage" class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {{ errorMessage }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 p-4 border-t border-border">
        <button class="text-muted-foreground px-3 py-2 text-sm" @click="handleBack">
          {{ t(step === 'connect' ? 'cancel' : 'back') }}
        </button>
        <button
          v-if="step === 'connect'"
          class="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="!canConnect || isProcessing"
          @click="handleConnect"
        >
          {{ t('connect') }}
        </button>
        <button
          v-else
          class="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="selectedPaths.size === 0 || isProcessing"
          @click="handleSubscribe"
        >
          {{ t('subscribe') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { discoverAsync, type CaldavCalendarInfo, type CaldavDiscoveryResult } from "~/composables/useCaldav";
import { calendars, type InsertCalendar } from "~/database/schemas";

const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const caldavAccountsStore = useCaldavAccountsStore();
const calendarsStore = useCalendarsStore();
const caldavSyncStore = useCaldavSyncStore();

const nameInput = ref<HTMLInputElement | null>(null);
const step = ref<"connect" | "select">("connect");
const isProcessing = ref(false);
const errorMessage = ref("");

const form = reactive({
  name: "",
  serverUrl: "",
  username: "",
  password: "",
});

const discoveredCalendars = ref<CaldavCalendarInfo[]>([]);
const selectedPaths = ref<Set<string>>(new Set());
const discoveryResult = ref<CaldavDiscoveryResult | null>(null);

const canConnect = computed(() =>
  form.name.trim() !== "" &&
  form.serverUrl.trim() !== "" &&
  form.username.trim() !== "" &&
  form.password.trim() !== "",
);

watch(isOpen, (open) => {
  if (open) {
    step.value = "connect";
    form.name = "";
    form.serverUrl = "";
    form.username = "";
    form.password = "";
    discoveredCalendars.value = [];
    selectedPaths.value = new Set();
    discoveryResult.value = null;
    isProcessing.value = false;
    errorMessage.value = "";
    nextTick(() => nameInput.value?.focus());
  }
});

async function handleConnect() {
  if (!canConnect.value || isProcessing.value) return;

  isProcessing.value = true;
  errorMessage.value = "";

  try {
    const result = await discoverAsync(form.serverUrl.trim(), form.username.trim(), form.password);
    discoveryResult.value = result;
    discoveredCalendars.value = result.calendars;

    // Auto-select all calendars
    selectedPaths.value = new Set(result.calendars.map((cal) => cal.path));
    step.value = "select";
  } catch (err) {
    console.error("[haex-calendar] CalDAV discovery failed:", err);
    errorMessage.value = t("errors.discovery");
  } finally {
    isProcessing.value = false;
  }
}

async function handleSubscribe() {
  if (selectedPaths.value.size === 0 || isProcessing.value || !discoveryResult.value) return;

  isProcessing.value = true;
  errorMessage.value = "";

  try {
    // Create the CalDAV account
    const accountId = await caldavAccountsStore.createAccountAsync({
      name: form.name.trim(),
      serverUrl: form.serverUrl.trim(),
      username: form.username.trim(),
      password: form.password,
      principalUrl: discoveryResult.value.principalUrl,
      calendarHomeUrl: discoveryResult.value.calendarHomeUrl,
    });

    if (!accountId || !haexVault.orm) return;

    // Create calendar entries for each selected calendar
    for (const cal of discoveredCalendars.value) {
      if (!selectedPaths.value.has(cal.path)) continue;

      const id = crypto.randomUUID();
      const entry: InsertCalendar = {
        id,
        name: cal.displayName,
        color: cal.color || "#3b82f6",
        caldavAccountId: accountId,
        caldavPath: cal.path,
        caldavCtag: cal.ctag,
      };
      await haexVault.orm.insert(calendars).values(entry);
    }

    // Reload calendars
    await calendarsStore.loadCalendarsAsync();

    // Trigger background sync
    caldavSyncStore.syncAllRemoteCalendarsAsync();

    isOpen.value = false;
  } catch (err) {
    console.error("[haex-calendar] CalDAV subscribe failed:", err);
    errorMessage.value = t("errors.subscribe");
  } finally {
    isProcessing.value = false;
  }
}

function handleBack() {
  if (step.value === "select") {
    step.value = "connect";
    errorMessage.value = "";
  } else {
    isOpen.value = false;
  }
}

function toggleCalendar(path: string) {
  const next = new Set(selectedPaths.value);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  selectedPaths.value = next;
}
</script>

<i18n lang="yaml">
de:
  title:
    connect: CalDAV-Konto verbinden
    select: Kalender auswählen
  fields:
    name: Anzeigename
    namePlaceholder: z.B. Nextcloud, iCloud
    serverUrl: Server-URL
    serverUrlPlaceholder: https://cloud.example.com
    username: Benutzername
    password: Passwort
  selectDescription: Wähle die Kalender aus, die du abonnieren möchtest.
  discovering: Verbinde mit Server...
  subscribing: Kalender werden eingerichtet...
  connect: Verbinden
  subscribe: Abonnieren
  cancel: Abbrechen
  back: Zurück
  errors:
    discovery: Verbindung zum CalDAV-Server fehlgeschlagen. Bitte überprüfe die Zugangsdaten.
    subscribe: Fehler beim Einrichten der Kalender.
en:
  title:
    connect: Connect CalDAV Account
    select: Select Calendars
  fields:
    name: Display Name
    namePlaceholder: e.g. Nextcloud, iCloud
    serverUrl: Server URL
    serverUrlPlaceholder: https://cloud.example.com
    username: Username
    password: Password
  selectDescription: Select the calendars you want to subscribe to.
  discovering: Connecting to server...
  subscribing: Setting up calendars...
  connect: Connect
  subscribe: Subscribe
  cancel: Cancel
  back: Back
  errors:
    discovery: Failed to connect to CalDAV server. Please check your credentials.
    subscribe: Failed to set up calendars.
</i18n>
