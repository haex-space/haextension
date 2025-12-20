// stores/syncRules.ts
// Sync rules are stored locally in the extension's Drizzle database.
// Uses the Core filesystem API for folder selection dialogs.

import { eq } from "drizzle-orm";
import { syncRules as syncRulesTable, type SelectSyncRule } from "~/database/schemas";

// Types for sync rules
export type SyncDirection = "up" | "down" | "both";
export type ConflictStrategy = "local" | "remote" | "newer" | "ask" | "keepBoth";

export interface SyncRule {
  id: string;
  spaceId: string;
  localPath: string;
  backendIds: string[];
  direction: SyncDirection;
  enabled: boolean;
  ignorePatterns: string[];
  conflictStrategy: ConflictStrategy;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AddSyncRuleOptions {
  spaceId: string;
  localPath: string;
  backendIds: string[];
  direction?: SyncDirection;
  ignorePatterns?: string[];
  conflictStrategy?: ConflictStrategy;
}

export interface UpdateSyncRuleOptions {
  ruleId: string;
  backendIds?: string[];
  direction?: SyncDirection;
  enabled?: boolean;
  ignorePatterns?: string[];
  conflictStrategy?: ConflictStrategy;
}

/**
 * Convert database row to SyncRule
 */
function dbRowToSyncRule(row: SelectSyncRule): SyncRule {
  return {
    id: row.id,
    spaceId: row.spaceId,
    localPath: row.localPath,
    backendIds: JSON.parse(row.backendIds) as string[],
    direction: row.direction as SyncDirection,
    enabled: row.enabled ?? true,
    ignorePatterns: JSON.parse(row.ignorePatterns) as string[],
    conflictStrategy: row.conflictStrategy as ConflictStrategy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const useSyncRulesStore = defineStore("syncRules", () => {
  const haexVaultStore = useHaexVaultStore();

  const syncRules = ref<SyncRule[]>([]);
  const isLoading = ref(false);

  /**
   * Load all sync rules from local database
   */
  const loadSyncRulesAsync = async (): Promise<void> => {
    if (!haexVaultStore.orm) {
      console.warn("[haex-files] Database not initialized");
      return;
    }

    isLoading.value = true;
    try {
      const rows = await haexVaultStore.orm.select().from(syncRulesTable);
      syncRules.value = rows.map(dbRowToSyncRule);
    } catch (error) {
      console.warn("[haex-files] Failed to load sync rules:", error);
      syncRules.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Add a new sync rule to local database
   */
  const addSyncRuleAsync = async (options: AddSyncRuleOptions): Promise<SyncRule> => {
    if (!haexVaultStore.orm) {
      throw new Error("Database not initialized");
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const newRow = {
      id,
      spaceId: options.spaceId,
      localPath: options.localPath,
      backendIds: JSON.stringify(options.backendIds),
      direction: options.direction || "both",
      enabled: true,
      ignorePatterns: JSON.stringify(options.ignorePatterns || []),
      conflictStrategy: options.conflictStrategy || "ask",
      createdAt: now,
      updatedAt: now,
    };

    await haexVaultStore.orm.insert(syncRulesTable).values(newRow);

    const newRule: SyncRule = {
      id,
      spaceId: options.spaceId,
      localPath: options.localPath,
      backendIds: options.backendIds,
      direction: options.direction || "both",
      enabled: true,
      ignorePatterns: options.ignorePatterns || [],
      conflictStrategy: options.conflictStrategy || "ask",
      createdAt: now,
      updatedAt: now,
    };

    syncRules.value.push(newRule);
    console.log(`[haex-files] Added sync rule: ${options.localPath} → ${options.direction}`);

    return newRule;
  };

  /**
   * Update a sync rule in local database
   */
  const updateSyncRuleAsync = async (options: UpdateSyncRuleOptions): Promise<SyncRule> => {
    if (!haexVaultStore.orm) {
      throw new Error("Database not initialized");
    }

    const existingIndex = syncRules.value.findIndex((r) => r.id === options.ruleId);
    if (existingIndex === -1) {
      throw new Error(`Sync rule not found: ${options.ruleId}`);
    }

    const existing = syncRules.value[existingIndex]!;
    const now = new Date().toISOString();

    const updates: Partial<{
      backendIds: string;
      direction: string;
      enabled: boolean;
      ignorePatterns: string;
      conflictStrategy: string;
      updatedAt: string;
    }> = {
      updatedAt: now,
    };

    if (options.backendIds !== undefined) {
      updates.backendIds = JSON.stringify(options.backendIds);
    }
    if (options.direction !== undefined) {
      updates.direction = options.direction;
    }
    if (options.enabled !== undefined) {
      updates.enabled = options.enabled;
    }
    if (options.ignorePatterns !== undefined) {
      updates.ignorePatterns = JSON.stringify(options.ignorePatterns);
    }
    if (options.conflictStrategy !== undefined) {
      updates.conflictStrategy = options.conflictStrategy;
    }

    await haexVaultStore.orm
      .update(syncRulesTable)
      .set(updates)
      .where(eq(syncRulesTable.id, options.ruleId));

    const updatedRule: SyncRule = {
      ...existing,
      backendIds: options.backendIds ?? existing.backendIds,
      direction: options.direction ?? existing.direction,
      enabled: options.enabled ?? existing.enabled,
      ignorePatterns: options.ignorePatterns ?? existing.ignorePatterns,
      conflictStrategy: options.conflictStrategy ?? existing.conflictStrategy,
      updatedAt: now,
    };

    syncRules.value[existingIndex] = updatedRule;
    console.log(`[haex-files] Updated sync rule: ${options.ruleId}`);

    return updatedRule;
  };

  /**
   * Remove a sync rule from local database
   */
  const removeSyncRuleAsync = async (ruleId: string): Promise<void> => {
    if (!haexVaultStore.orm) {
      throw new Error("Database not initialized");
    }

    await haexVaultStore.orm
      .delete(syncRulesTable)
      .where(eq(syncRulesTable.id, ruleId));

    syncRules.value = syncRules.value.filter((r) => r.id !== ruleId);
    console.log(`[haex-files] Removed sync rule: ${ruleId}`);
  };

  /**
   * Open folder selection dialog via Core filesystem API
   */
  const selectFolderAsync = async (): Promise<string | null> => {
    return await haexVaultStore.client.filesystem.selectFolder({
      title: "Select Sync Folder",
    });
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
