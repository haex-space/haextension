<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')" :description="t('description')">
    <template #content>
      <div class="space-y-6 p-4">
        <!-- Current assignments -->
        <div v-if="assignments.length > 0">
          <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {{ t('currentSpaces') }}
          </h3>
          <div class="space-y-2">
            <div
              v-for="assignment in assignments"
              :key="assignment.spaceId"
              class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted"
            >
              <div class="flex items-center gap-2 min-w-0">
                <Users class="w-4 h-4 text-muted-foreground shrink-0" />
                <span class="text-sm truncate font-mono">{{ assignment.spaceId }}</span>
              </div>
              <button
                class="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors shrink-0"
                :title="t('unshare')"
                :disabled="isProcessing"
                @click="handleUnshare(assignment.spaceId)"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div v-else class="text-sm text-muted-foreground text-center py-4">
          {{ t('noSpaces') }}
        </div>

        <!-- Add new space -->
        <div class="border-t border-border pt-4">
          <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {{ t('addSpace') }}
          </h3>
          <div class="flex gap-2">
            <input
              ref="spaceInput"
              v-model="newSpaceId"
              class="flex-1 min-w-0 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-primary font-mono"
              :placeholder="t('spaceIdPlaceholder')"
              @keydown.enter="handleShare"
            />
            <button
              class="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm hover:opacity-90 transition-opacity shrink-0 disabled:opacity-50"
              :disabled="!isValidUuid || isProcessing"
              @click="handleShare"
            >
              {{ t('share') }}
            </button>
          </div>
          <p v-if="newSpaceId && !isValidUuid" class="text-xs text-destructive mt-1">
            {{ t('invalidUuid') }}
          </p>
        </div>

        <!-- Error display -->
        <p v-if="errorMessage" class="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {{ errorMessage }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end p-4 border-t border-border">
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
import { Users, X } from "lucide-vue-next";
import type { SpaceAssignment } from "@haex-space/vault-sdk";

const props = defineProps<{
  calendarId: string;
}>();

const isOpen = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const calendarsStore = useCalendarsStore();

const newSpaceId = ref("");
const assignments = ref<SpaceAssignment[]>([]);
const isProcessing = ref(false);
const errorMessage = ref("");
const spaceInput = ref<HTMLInputElement | null>(null);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = computed(() => UUID_REGEX.test(newSpaceId.value.trim()));

watch(isOpen, async (open) => {
  if (open) {
    newSpaceId.value = "";
    errorMessage.value = "";
    await loadAssignments();
    nextTick(() => spaceInput.value?.focus());
  }
});

async function loadAssignments() {
  try {
    assignments.value = await calendarsStore.getCalendarAssignmentsAsync(props.calendarId);
  } catch (err) {
    console.warn("[haex-calendar] Failed to load space assignments:", err);
    assignments.value = [];
  }
}

async function handleShare() {
  const spaceId = newSpaceId.value.trim();
  if (!spaceId || !isValidUuid.value || isProcessing.value) return;

  // Check if already assigned
  if (assignments.value.some((a) => a.spaceId === spaceId)) {
    errorMessage.value = t('alreadyShared');
    return;
  }

  isProcessing.value = true;
  errorMessage.value = "";
  try {
    await calendarsStore.shareCalendarWithSpaceAsync(props.calendarId, spaceId);
    newSpaceId.value = "";
    await loadAssignments();
  } catch (err) {
    console.error("[haex-calendar] Share failed:", err);
    errorMessage.value = t('shareFailed');
  } finally {
    isProcessing.value = false;
  }
}

async function handleUnshare(spaceId: string) {
  if (isProcessing.value) return;

  isProcessing.value = true;
  errorMessage.value = "";
  try {
    await calendarsStore.unshareCalendarFromSpaceAsync(props.calendarId, spaceId);
    await loadAssignments();
  } catch (err) {
    console.error("[haex-calendar] Unshare failed:", err);
    errorMessage.value = t('unshareFailed');
  } finally {
    isProcessing.value = false;
  }
}
</script>

<i18n lang="yaml">
de:
  title: Kalender teilen
  description: Teile diesen Kalender mit einem Shared Space, um ihn mit anderen Nutzern zu synchronisieren.
  currentSpaces: Aktuelle Spaces
  noSpaces: Dieser Kalender ist mit keinem Space geteilt.
  addSpace: Space hinzufügen
  spaceIdPlaceholder: Space-ID (UUID)
  share: Teilen
  unshare: Freigabe aufheben
  close: Schließen
  invalidUuid: Bitte gib eine gültige UUID ein.
  alreadyShared: Dieser Kalender ist bereits mit diesem Space geteilt.
  shareFailed: Fehler beim Teilen des Kalenders.
  unshareFailed: Fehler beim Aufheben der Freigabe.
en:
  title: Share Calendar
  description: Share this calendar with a Shared Space to sync it with other users.
  currentSpaces: Current Spaces
  noSpaces: This calendar is not shared with any space.
  addSpace: Add Space
  spaceIdPlaceholder: Space ID (UUID)
  share: Share
  unshare: Unshare
  close: Close
  invalidUuid: Please enter a valid UUID.
  alreadyShared: This calendar is already shared with this space.
  shareFailed: Failed to share the calendar.
  unshareFailed: Failed to unshare the calendar.
</i18n>
