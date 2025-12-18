// stores/syncRules.ts
import type { SyncRule, SyncDirection, AddSyncRuleOptions, UpdateSyncRuleOptions } from "@haex-space/vault-sdk";

export type { SyncRule, SyncDirection, UpdateSyncRuleOptions };

export const useSyncRulesStore = defineStore("syncRules", () => {
  const haexVaultStore = useHaexVaultStore();

  const syncRules = ref<SyncRule[]>([]);
  const isLoading = ref(false);

  /**
   * Load all sync rules via SDK
   */
  const loadSyncRulesAsync = async (): Promise<void> => {
    isLoading.value = true;
    try {
      syncRules.value = await haexVaultStore.client.filesystem.sync.listSyncRulesAsync();
    } catch (error) {
      console.warn("[haex-files] Failed to load sync rules:", error);
      syncRules.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Add a new sync rule via SDK
   */
  const addSyncRuleAsync = async (options: AddSyncRuleOptions): Promise<SyncRule> => {
    const newRule = await haexVaultStore.client.filesystem.sync.addSyncRuleAsync(options);

    syncRules.value.push(newRule);
    console.log(`[haex-files] Added sync rule: ${options.localPath} → ${options.direction}`);

    return newRule;
  };

  /**
   * Update a sync rule via SDK
   */
  const updateSyncRuleAsync = async (options: UpdateSyncRuleOptions): Promise<SyncRule> => {
    const updatedRule = await haexVaultStore.client.filesystem.sync.updateSyncRuleAsync(options);

    const index = syncRules.value.findIndex((r) => r.id === options.ruleId);
    if (index !== -1) {
      syncRules.value[index] = updatedRule;
    }
    console.log(`[haex-files] Updated sync rule: ${options.ruleId}`);

    return updatedRule;
  };

  /**
   * Remove a sync rule via SDK
   */
  const removeSyncRuleAsync = async (ruleId: string): Promise<void> => {
    await haexVaultStore.client.filesystem.sync.removeSyncRuleAsync(ruleId);
    syncRules.value = syncRules.value.filter((r) => r.id !== ruleId);
    console.log(`[haex-files] Removed sync rule: ${ruleId}`);
  };

  /**
   * Open folder selection dialog via SDK
   */
  const selectFolderAsync = async (): Promise<string | null> => {
    return await haexVaultStore.client.filesystem.sync.selectFolderAsync();
  };

  /**
   * Get sync rules for a specific space
   */
  const getRulesForSpace = (spaceId: string): SyncRule[] => {
    return syncRules.value.filter((r) => r.spaceId === spaceId);
  };

  /**
   * Get a sync rule by ID
   */
  const getRule = (ruleId: string): SyncRule | undefined => {
    return syncRules.value.find((r) => r.id === ruleId);
  };

  return {
    syncRules: computed(() => syncRules.value),
    isLoading: computed(() => isLoading.value),
    loadSyncRulesAsync,
    addSyncRuleAsync,
    updateSyncRuleAsync,
    removeSyncRuleAsync,
    selectFolderAsync,
    getRulesForSpace,
    getRule,
  };
});
