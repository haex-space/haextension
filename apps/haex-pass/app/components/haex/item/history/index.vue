<template>
  <div class="h-full overflow-y-auto p-6 space-y-4">
    <div v-if="snapshots.length === 0" class="flex flex-col items-center justify-center h-full text-center">
      <History class="w-12 h-12 text-muted-foreground mb-4" />
      <p class="text-muted-foreground">{{ t('noHistory') }}</p>
      <p class="text-sm text-muted-foreground/70 mt-2">{{ t('noHistoryDescription') }}</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="snapshot in snapshots"
        :key="snapshot.id"
        class="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
        @click="viewSnapshot(snapshot)"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <Clock class="w-4 h-4 text-muted-foreground" />
              <p class="text-sm font-medium">
                {{ formatDate(snapshot.createdAt) }}
              </p>
            </div>
            <div v-if="snapshotData(snapshot)" class="space-y-1">
              <p v-if="snapshotData(snapshot).title" class="text-sm truncate">
                <span class="text-muted-foreground">{{ t('title') }}:</span>
                {{ snapshotData(snapshot).title }}
              </p>
              <p v-if="snapshotData(snapshot).username" class="text-sm truncate">
                <span class="text-muted-foreground">{{ t('username') }}:</span>
                {{ snapshotData(snapshot).username }}
              </p>
            </div>
          </div>
          <UiButton
            :icon="RotateCcw"
            variant="ghost"
            size="icon-sm"
            :title="t('restore')"
            @click.stop="restoreSnapshot(snapshot)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { History, Clock, RotateCcw } from "lucide-vue-next";
import type { SelectHaexPasswordsItemSnapshots } from "~/database";

const props = defineProps<{
  itemId: string;
}>();

const { t } = useI18n();
const snapshots = ref<SelectHaexPasswordsItemSnapshots[]>([]);

// Load snapshots for this item
const loadSnapshotsAsync = async () => {
  // TODO: Implement snapshot loading from database
  // For now, return empty array
  snapshots.value = [];
};

// Parse snapshot data
const snapshotData = (snapshot: SelectHaexPasswordsItemSnapshots) => {
  try {
    return JSON.parse(snapshot.snapshotData);
  } catch {
    return null;
  }
};

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

// View snapshot details
const viewSnapshot = (snapshot: SelectHaexPasswordsItemSnapshots) => {
  // TODO: Implement snapshot view
  console.log('View snapshot:', snapshot);
};

// Restore snapshot
const restoreSnapshot = (snapshot: SelectHaexPasswordsItemSnapshots) => {
  // TODO: Implement snapshot restore
  console.log('Restore snapshot:', snapshot);
};

// Load snapshots on mount
onMounted(() => {
  loadSnapshotsAsync();
});

// Reload when itemId changes
watch(() => props.itemId, () => {
  loadSnapshotsAsync();
});
</script>

<i18n lang="yaml">
de:
  noHistory: Kein Verlauf vorhanden
  noHistoryDescription: Änderungen an diesem Eintrag werden hier angezeigt
  title: Titel
  username: Benutzername
  restore: Wiederherstellen

en:
  noHistory: No history available
  noHistoryDescription: Changes to this entry will be shown here
  title: Title
  username: Username
  restore: Restore
</i18n>
