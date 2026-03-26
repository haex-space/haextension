<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')" :description="t('description')">
    <template #content>
      <div class="space-y-6 p-4">
        <!-- Loading -->
        <div v-if="isLoadingSpaces" class="flex items-center justify-center py-8">
          <Loader2 class="w-5 h-5 animate-spin text-primary" />
        </div>

        <template v-else>
          <!-- Available Spaces -->
          <div>
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {{ t('availableSpaces') }}
            </h3>

            <div v-if="availableSpaces.length > 0" class="space-y-2">
              <button
                v-for="space in availableSpaces"
                :key="space.id"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                :class="isSpaceAssigned(space.id)
                  ? 'bg-primary/10 border border-primary/30'
                  : 'bg-muted hover:bg-muted/80'"
                :disabled="isProcessing"
                @click="toggleSpaceAssignment(space)"
              >
                <div
                  class="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                  :class="isSpaceAssigned(space.id)
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/30'"
                >
                  <Check v-if="isSpaceAssigned(space.id)" class="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-medium truncate block">{{ space.name }}</span>
                  <span class="text-xs text-muted-foreground truncate block">{{ space.serverUrl }}</span>
                </div>
                <span
                  class="text-xs px-1.5 py-0.5 rounded-full shrink-0"
                  :class="space.role === 'admin'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted-foreground/10 text-muted-foreground'"
                >
                  {{ space.role }}
                </span>
              </button>
            </div>

            <p v-else class="text-sm text-muted-foreground text-center py-4">
              {{ t('noSpaces') }}
            </p>
          </div>

          <!-- Create new space (collapsible) -->
          <div class="border-t border-border pt-4">
            <button
              class="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider w-full"
              @click="showCreateForm = !showCreateForm"
            >
              <ChevronRight
                class="w-4 h-4 transition-transform"
                :class="showCreateForm && 'rotate-90'"
              />
              {{ t('createSpace') }}
            </button>

            <div v-if="showCreateForm" class="mt-3 space-y-3">
              <input
                ref="createNameInput"
                v-model="createForm.name"
                class="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
                :placeholder="t('namePlaceholder')"
                @keydown.enter="handleCreateAndShare"
              >

              <select
                v-if="syncBackends.length > 1"
                v-model="createForm.serverUrl"
                class="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary"
              >
                <option
                  v-for="backend in syncBackends"
                  :key="backend.id"
                  :value="backend.serverUrl"
                >
                  {{ backend.name }} ({{ backend.serverUrl }})
                </option>
              </select>

              <button
                class="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                :disabled="!createForm.name.trim() || !createForm.serverUrl || isProcessing"
                @click="handleCreateAndShare"
              >
                {{ t('createAndShare') }}
              </button>
            </div>
          </div>
        </template>

        <!-- Error display -->
        <p v-if="errorMessage" class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {{ errorMessage }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <button
          class="text-muted-foreground px-3 py-2 text-sm"
          @click="isOpen = false"
        >
          {{ t('close') }}
        </button>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { Check, ChevronRight, Loader2 } from "lucide-vue-next";
import type { SpaceAssignment, DecryptedSpace, SyncBackendInfo } from "@haex-space/vault-sdk";

const props = defineProps<{
  calendarId: string;
}>();

const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const haexVault = useHaexVaultStore();
const calendarsStore = useCalendarsStore();

const availableSpaces = ref<DecryptedSpace[]>([]);
const assignments = ref<SpaceAssignment[]>([]);
const syncBackends = ref<SyncBackendInfo[]>([]);
const isLoadingSpaces = ref(false);
const isProcessing = ref(false);
const errorMessage = ref("");
const showCreateForm = ref(false);
const createNameInput = ref<HTMLInputElement | null>(null);

const createForm = reactive({
  name: "",
  serverUrl: "",
});

watch(isOpen, async (open) => {
  if (open) {
    errorMessage.value = "";
    showCreateForm.value = false;
    createForm.name = "";
    await loadDataAsync();
  }
}, { immediate: true });

watch(showCreateForm, (show) => {
  if (show) {
    nextTick(() => createNameInput.value?.focus());
  }
});

function isSpaceAssigned(spaceId: string): boolean {
  return assignments.value.some((assignment) => assignment.spaceId === spaceId);
}

async function loadDataAsync() {
  isLoadingSpaces.value = true;
  try {
    const [spacesResult, assignmentsResult, backendsResult] = await Promise.all([
      haexVault.client.spaces.listSpacesAsync(),
      calendarsStore.getCalendarAssignmentsAsync(props.calendarId),
      haexVault.client.spaces.listSyncBackendsAsync(),
    ]);
    availableSpaces.value = spacesResult;
    assignments.value = assignmentsResult;
    syncBackends.value = backendsResult;

    // Pre-select backend: prefer default, fall back to first available
    const defaultBackend = backendsResult.find((backend) => backend.isDefault) ?? backendsResult[0];
    if (defaultBackend) {
      createForm.serverUrl = defaultBackend.serverUrl;
    }
  } catch (err) {
    console.warn("[haex-calendar] Failed to load share dialog data:", err);
    errorMessage.value = t('loadFailed');
  } finally {
    isLoadingSpaces.value = false;
  }
}

async function toggleSpaceAssignment(space: DecryptedSpace) {
  if (isProcessing.value) return;

  isProcessing.value = true;
  errorMessage.value = "";
  try {
    if (isSpaceAssigned(space.id)) {
      await calendarsStore.unshareCalendarFromSpaceAsync(props.calendarId, space.id);
    } else {
      await calendarsStore.shareCalendarWithSpaceAsync(props.calendarId, space.id);
    }
    assignments.value = await calendarsStore.getCalendarAssignmentsAsync(props.calendarId);
  } catch (err) {
    console.error("[haex-calendar] Toggle space assignment failed:", err);
    errorMessage.value = isSpaceAssigned(space.id) ? t('unshareFailed') : t('shareFailed');
  } finally {
    isProcessing.value = false;
  }
}

async function handleCreateAndShare() {
  const spaceName = createForm.name.trim();
  if (!spaceName || !createForm.serverUrl || isProcessing.value) return;

  isProcessing.value = true;
  errorMessage.value = "";
  try {
    const newSpace = await haexVault.client.spaces.createSpaceAsync(spaceName, createForm.serverUrl);
    await calendarsStore.shareCalendarWithSpaceAsync(props.calendarId, newSpace.id);

    // Refresh data
    createForm.name = "";
    showCreateForm.value = false;
    await loadDataAsync();
  } catch (err) {
    console.error("[haex-calendar] Create and share failed:", err);
    errorMessage.value = t('createFailed');
  } finally {
    isProcessing.value = false;
  }
}
</script>

<i18n lang="yaml">
de:
  title: Kalender teilen
  description: Teile diesen Kalender mit Shared Spaces, um ihn mit anderen Nutzern zu synchronisieren.
  availableSpaces: Verfügbare Spaces
  noSpaces: Du bist noch keinem Space beigetreten. Erstelle einen neuen Space.
  createSpace: Neuen Space erstellen
  namePlaceholder: Name (z.B. Familie, Arbeit)
  createAndShare: Erstellen & Teilen
  close: Schließen
  loadFailed: Daten konnten nicht geladen werden.
  shareFailed: Fehler beim Teilen des Kalenders.
  unshareFailed: Fehler beim Aufheben der Freigabe.
  createFailed: Fehler beim Erstellen des Spaces.
en:
  title: Share Calendar
  description: Share this calendar with Shared Spaces to sync it with other users.
  availableSpaces: Available Spaces
  noSpaces: You haven't joined any space yet. Create a new space.
  createSpace: Create new space
  namePlaceholder: Name (e.g. Family, Work)
  createAndShare: Create & Share
  close: Close
  loadFailed: Failed to load data.
  shareFailed: Failed to share the calendar.
  unshareFailed: Failed to unshare the calendar.
  createFailed: Failed to create the space.
</i18n>
