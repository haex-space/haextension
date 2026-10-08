import type { Ref } from "vue";
import type { FileChangeEvent } from "@haex-space/vault-sdk";
import { HAEXTENSION_EVENTS } from "@haex-space/vault-sdk";
import type { SyncRule } from "../syncRules";
import type { LocalFileInfo } from "./types";

interface FilesWatcherDeps {
  isSyncing: Ref<boolean>;
  currentRuleId: Ref<string | null>;
  currentSubpath: Ref<string>;
  loadFilesAsync: (ruleId: string, subpath?: string) => Promise<void>;
  scanAllLocalFilesAsync: (ruleId: string, subpath?: string) => Promise<LocalFileInfo[]>;
  triggerSyncAsync: (ruleId?: string) => Promise<void>;
}

export function useFilesWatcher({
  isSyncing,
  currentRuleId,
  currentSubpath,
  loadFilesAsync,
  scanAllLocalFilesAsync,
  triggerSyncAsync,
}: FilesWatcherDeps) {
  const haexVaultStore = useHaexVaultStore();
  const syncRulesStore = useSyncRulesStore();

  // ==========================================================================
  // Auto-Sync Watcher (Native + Fallback Polling)
  // ==========================================================================

  // Native file watcher state
  const watcherEnabled = ref(false);
  const watchedRules = ref<Set<string>>(new Set()); // Set of actively watched rule IDs
  const fileChangeEventHandler = ref<((event: FileChangeEvent) => void) | null>(null); // Event listener reference

  // Fallback polling state (runs less frequently as backup)
  const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);
  const pollingIntervalMs = ref(5 * 60 * 1000); // Fallback polling every 5 minutes
  const lastKnownFileHashes = ref<Map<string, string>>(new Map()); // ruleId -> hash of file list

  /**
   * Generate a simple hash of file list for change detection (used by fallback polling)
   * Uses file paths, sizes, and modification times
   */
  const generateFileListHash = (fileList: LocalFileInfo[]): string => {
    const sortedFiles = [...fileList]
      .filter(f => !f.isDirectory)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    const hashInput = sortedFiles
      .map(f => `${f.relativePath}:${f.size}:${f.modifiedAt ?? 0}`)
      .join("|");

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  };

  /**
   * Handle file change events from native file watcher
   */
  const handleFileChangeEvent = async (event: FileChangeEvent): Promise<void> => {
    console.log(`[haex-files] Native file change detected:`, event);

    // Skip if already syncing
    if (isSyncing.value) {
      console.log("[haex-files] Sync already in progress, skipping auto-sync");
      return;
    }

    // Skip if a permission was denied - prevent endless loop
    if (haexVaultStore.deniedPermission) {
      console.log("[haex-files] Permission denied, skipping auto-sync until resolved");
      return;
    }

    const rule = syncRulesStore.getRule(event.ruleId);
    if (!rule) {
      console.warn(`[haex-files] Unknown rule for file change event: ${event.ruleId}`);
      return;
    }

    // Skip if rule is disabled or direction is download-only
    if (!rule.enabled || rule.direction === "down") {
      return;
    }

    // Refresh file list immediately if viewing this rule (before sync starts)
    if (currentRuleId.value === event.ruleId) {
      await loadFilesAsync(event.ruleId, currentSubpath.value);
    }

    // Trigger sync for this rule
    console.log(`[haex-files] Triggering auto-sync for rule "${event.ruleId}" due to file change`);
    await triggerSyncAsync(event.ruleId);
  };

  /**
   * Start native file watcher for a sync rule
   */
  const startNativeWatcherForRuleAsync = async (rule: SyncRule): Promise<boolean> => {
    // Skip if rule is disabled or direction is download-only (no upload needed)
    if (!rule.enabled || rule.direction === "down") {
      return false;
    }

    try {
      // Check if already watching
      const isWatching = await haexVaultStore.client.filesystem.isWatching(rule.id);
      if (isWatching) {
        watchedRules.value.add(rule.id);
        return true;
      }

      // Start native watcher
      await haexVaultStore.client.filesystem.watch(rule.id, rule.localPath);
      watchedRules.value.add(rule.id);
      console.log(`[haex-files] Native watcher started for rule "${rule.id}" at: ${rule.localPath}`);
      return true;
    } catch (error) {
      console.warn(`[haex-files] Failed to start native watcher for rule "${rule.id}":`, error);
      return false;
    }
  };

  /**
   * Stop native file watcher for a sync rule
   */
  const stopNativeWatcherForRuleAsync = async (ruleId: string): Promise<void> => {
    try {
      await haexVaultStore.client.filesystem.unwatch(ruleId);
      watchedRules.value.delete(ruleId);
      console.log(`[haex-files] Native watcher stopped for rule "${ruleId}"`);
    } catch (error) {
      console.warn(`[haex-files] Failed to stop native watcher for rule "${ruleId}":`, error);
    }
  };

  /**
   * Check a single sync rule for changes (fallback polling)
   */
  const checkRuleForChangesAsync = async (rule: SyncRule): Promise<void> => {
    // Skip if rule is disabled or direction is download-only
    if (!rule.enabled || rule.direction === "down") {
      return;
    }

    // Skip if a permission was denied - prevent endless loop
    if (haexVaultStore.deniedPermission) {
      return;
    }

    try {
      // Scan all files for this rule
      const currentFiles = await scanAllLocalFilesAsync(rule.id);
      const currentHash = generateFileListHash(currentFiles);
      const previousHash = lastKnownFileHashes.value.get(rule.id);

      // Update the stored hash
      lastKnownFileHashes.value.set(rule.id, currentHash);

      // If hash changed and we have a previous hash (not first run), trigger sync
      if (previousHash && currentHash !== previousHash) {
        console.log(`[haex-files] Fallback polling: changes detected in rule "${rule.id}", triggering sync...`);
        await triggerSyncAsync(rule.id);
      }
    } catch (error) {
      // Silently ignore errors during background watching
      console.debug(`[haex-files] Polling error for rule ${rule.id}:`, error);
    }
  };

  /**
   * Run one iteration of the fallback polling (check all rules)
   */
  const runPollingIterationAsync = async (): Promise<void> => {
    // Don't run if already syncing
    if (isSyncing.value) {
      return;
    }

    const rules = syncRulesStore.syncRules;
    for (const rule of rules) {
      await checkRuleForChangesAsync(rule);
    }
  };

  /**
   * Start the auto-sync watcher (native + fallback polling)
   * Uses native file system events for real-time detection with fallback polling every 5 minutes
   * Also triggers initial sync for all enabled rules to catch any pending changes
   */
  const startWatcher = async (): Promise<void> => {
    if (watcherEnabled.value) {
      console.log("[haex-files] Watcher already running");
      return;
    }

    watcherEnabled.value = true;
    const rules = syncRulesStore.syncRules;

    // Start native watchers for all applicable rules
    let nativeWatchersStarted = 0;
    for (const rule of rules) {
      if (rule.enabled && rule.direction !== "down") {
        const success = await startNativeWatcherForRuleAsync(rule);
        if (success) nativeWatchersStarted++;
      }
    }

    // Register event listener for native file change events
    if (fileChangeEventHandler.value) {
      haexVaultStore.client.off(HAEXTENSION_EVENTS.FILE_CHANGED, fileChangeEventHandler.value as any);
    }
    fileChangeEventHandler.value = (event: FileChangeEvent) => {
      handleFileChangeEvent(event);
    };
    haexVaultStore.client.on(
      HAEXTENSION_EVENTS.FILE_CHANGED,
      fileChangeEventHandler.value as any
    );

    // Initialize hashes for fallback polling
    for (const rule of rules) {
      if (rule.enabled && rule.direction !== "down") {
        try {
          const files = await scanAllLocalFilesAsync(rule.id);
          lastKnownFileHashes.value.set(rule.id, generateFileListHash(files));
        } catch {
          // Ignore initialization errors
        }
      }
    }

    // Trigger initial sync for all enabled rules to catch any pending changes
    console.log("[haex-files] Running initial sync for all enabled rules...");
    for (const rule of rules) {
      if (rule.enabled) {
        try {
          await triggerSyncAsync(rule.id);
        } catch (error) {
          console.warn(`[haex-files] Initial sync failed for rule "${rule.id}":`, error);
        }
      }
    }

    // Start fallback polling (every 5 minutes)
    pollingInterval.value = setInterval(() => {
      runPollingIterationAsync();
    }, pollingIntervalMs.value);

    console.log(`[haex-files] Auto-sync watcher started: ${nativeWatchersStarted} native watchers, fallback polling every ${pollingIntervalMs.value / 1000}s`);
  };

  /**
   * Stop the auto-sync watcher
   */
  const stopWatcher = async (): Promise<void> => {
    // Stop native watchers
    for (const ruleId of watchedRules.value) {
      await stopNativeWatcherForRuleAsync(ruleId);
    }
    watchedRules.value.clear();

    // Unsubscribe from events
    if (fileChangeEventHandler.value) {
      haexVaultStore.client.off(HAEXTENSION_EVENTS.FILE_CHANGED, fileChangeEventHandler.value as any);
      fileChangeEventHandler.value = null;
    }

    // Stop fallback polling
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value);
      pollingInterval.value = null;
    }

    watcherEnabled.value = false;
    lastKnownFileHashes.value.clear();
    console.log("[haex-files] Auto-sync watcher stopped");
  };

  /**
   * Check if watcher is running
   */
  const isWatcherRunning = computed(() => watcherEnabled.value);

  /**
   * Get number of active native watchers
   */
  const activeNativeWatchers = computed(() => watchedRules.value.size);

  return {
    isWatcherRunning,
    activeNativeWatchers,
    startWatcher,
    stopWatcher,
  };
}
