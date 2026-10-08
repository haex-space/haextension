import type { Ref } from "vue";

// Sync status polling
const POLL_INTERVAL_SYNCING = 1000; // 1 second when syncing
const POLL_INTERVAL_IDLE = 30000; // 30 seconds when idle

export const useSyncStatusPolling = (currentRuleId: Ref<string | null>) => {
  const filesStore = useFilesStore();
  let pollIntervalId: ReturnType<typeof setInterval> | null = null;

  const startSyncStatusPolling = () => {
    stopSyncStatusPolling();

    const poll = async () => {
      await filesStore.loadSyncStatusAsync();
      // Also reload queue entries to update file status badges and error list
      if (currentRuleId.value) {
        await filesStore.loadQueueEntriesAsync(currentRuleId.value);
      }

      // Adjust polling interval based on sync state
      const currentInterval = filesStore.isSyncing
        ? POLL_INTERVAL_SYNCING
        : POLL_INTERVAL_IDLE;

      // Restart with new interval if needed
      if (pollIntervalId) {
        stopSyncStatusPolling();
        pollIntervalId = setInterval(poll, currentInterval);
      }
    };

    // Start with syncing interval, will adjust automatically
    pollIntervalId = setInterval(poll, POLL_INTERVAL_SYNCING);
  };

  const stopSyncStatusPolling = () => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  };

  return { startSyncStatusPolling, stopSyncStatusPolling };
};
