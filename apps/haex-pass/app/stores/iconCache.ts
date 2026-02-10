import { defineStore } from 'pinia';
import { useDebounceFn } from '@vueuse/core';
import { inArray } from 'drizzle-orm';
import { haexPasswordsBinaries } from '~/database/schemas';

/**
 * Icon Cache Store
 *
 * Caches custom binary icons loaded from the database.
 * Uses batch loading to minimize database queries and avoid concurrent query limits.
 */
export const useIconCacheStore = defineStore('iconCache', () => {
  // Cache: hash -> data URL
  const cache = ref<Map<string, string>>(new Map());

  // Pending hashes waiting to be loaded
  const pendingHashes = ref<Set<string>>(new Set());

  // Loading state
  const isLoading = ref(false);

  const { orm } = storeToRefs(useHaexVaultStore());

  /**
   * Get icon data URL from cache
   * Returns null if not cached yet
   */
  const getIconDataUrl = (hash: string): string | null => {
    return cache.value.get(hash) ?? null;
  };

  /**
   * Check if icon is cached
   */
  const isCached = (hash: string): boolean => {
    return cache.value.has(hash);
  };

  /**
   * Load all pending icons in a single batch query
   */
  const loadPendingIconsAsync = async (): Promise<void> => {
    if (pendingHashes.value.size === 0 || !orm.value || isLoading.value) {
      return;
    }

    isLoading.value = true;
    const hashesToLoad = Array.from(pendingHashes.value);
    pendingHashes.value.clear();

    try {
      // Batch query for all requested icons
      const results = await orm.value
        .select({
          hash: haexPasswordsBinaries.hash,
          data: haexPasswordsBinaries.data,
        })
        .from(haexPasswordsBinaries)
        .where(inArray(haexPasswordsBinaries.hash, hashesToLoad));

      // Update cache with results
      for (const row of results) {
        if (row.data) {
          cache.value.set(row.hash, `data:image/png;base64,${row.data}`);
        }
      }

      // Mark missing icons as empty string to avoid re-fetching
      for (const hash of hashesToLoad) {
        if (!cache.value.has(hash)) {
          cache.value.set(hash, '');
        }
      }
    } catch (error) {
      // DrizzleQueryError wraps the original error in .cause
      const cause = error instanceof Error && 'cause' in error ? error.cause : null;
      console.error('[IconCache] Failed to load icons batch:', cause || error);

      // Put hashes back in pending for retry
      for (const hash of hashesToLoad) {
        if (!cache.value.has(hash)) {
          pendingHashes.value.add(hash);
        }
      }
    } finally {
      isLoading.value = false;

      // If more icons were requested during loading, schedule another batch
      if (pendingHashes.value.size > 0) {
        debouncedLoadPendingIcons();
      }
    }
  };

  // Debounced batch loader - waits 50ms to collect icon requests
  const debouncedLoadPendingIcons = useDebounceFn(loadPendingIconsAsync, 50);

  /**
   * Request an icon to be loaded
   * Icons are batched and loaded together to minimize queries
   */
  const requestIcon = (hash: string): void => {
    if (cache.value.has(hash) || pendingHashes.value.has(hash)) {
      return;
    }

    pendingHashes.value.add(hash);
    debouncedLoadPendingIcons();
  };

  /**
   * Preload all icons from database
   * Call this on app init to avoid individual queries later
   */
  const preloadAllIconsAsync = async (): Promise<void> => {
    if (!orm.value) {
      return;
    }

    isLoading.value = true;

    try {
      const results = await orm.value
        .select({
          hash: haexPasswordsBinaries.hash,
          data: haexPasswordsBinaries.data,
        })
        .from(haexPasswordsBinaries);

      for (const row of results) {
        if (row.data) {
          cache.value.set(row.hash, `data:image/png;base64,${row.data}`);
        }
      }

      // Clear any pending requests since we loaded everything
      pendingHashes.value.clear();
    } catch (error) {
      const cause = error instanceof Error && 'cause' in error ? error.cause : null;
      console.error('[IconCache] Failed to preload icons:', cause || error);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Invalidate cache for a specific icon
   */
  const invalidate = (hash: string): void => {
    cache.value.delete(hash);
  };

  /**
   * Clear entire cache
   */
  const clear = (): void => {
    cache.value.clear();
    pendingHashes.value.clear();
  };

  return {
    // State
    cache,
    isLoading,

    // Getters
    getIconDataUrl,
    isCached,

    // Actions
    requestIcon,
    preloadAllIconsAsync,
    invalidate,
    clear,
  };
});
