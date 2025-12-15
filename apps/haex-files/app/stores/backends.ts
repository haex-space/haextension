// stores/backends.ts
import type { StorageBackendInfo, S3BackendConfig, StorageBackendType } from "@haex-space/vault-sdk";

// Re-export types from SDK for convenience
export type { StorageBackendInfo, S3BackendConfig, StorageBackendType };

export const useBackendsStore = defineStore("backends", () => {
  const haexVaultStore = useHaexVaultStore();

  const backends = ref<StorageBackendInfo[]>([]);
  const isLoading = ref(false);
  const testingBackendId = ref<string | null>(null);
  const testResult = ref<{ backendId: string; success: boolean; error?: string } | null>(null);

  /**
   * Load all backends via SDK
   */
  const loadBackendsAsync = async (): Promise<void> => {
    isLoading.value = true;
    try {
      backends.value = await haexVaultStore.client.filesystem.sync.listBackendsAsync();
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Add a new storage backend via SDK
   */
  const addBackendAsync = async (
    name: string,
    type: StorageBackendType,
    config: S3BackendConfig
  ): Promise<StorageBackendInfo> => {
    const newBackend = await haexVaultStore.client.filesystem.sync.addBackendAsync({
      name,
      type,
      config,
    });

    backends.value.push(newBackend);
    console.log(`[haex-files] Added backend: ${name} (${type})`);

    return newBackend;
  };

  /**
   * Remove a backend via SDK
   */
  const removeBackendAsync = async (backendId: string): Promise<void> => {
    await haexVaultStore.client.filesystem.sync.removeBackendAsync(backendId);
    backends.value = backends.value.filter((b) => b.id !== backendId);
    console.log(`[haex-files] Removed backend: ${backendId}`);
  };

  /**
   * Test backend connection via SDK
   */
  const testBackendAsync = async (backendId: string): Promise<boolean> => {
    testingBackendId.value = backendId;
    testResult.value = null;

    try {
      const success = await haexVaultStore.client.filesystem.sync.testBackendAsync(backendId);
      testResult.value = { backendId, success };

      const backend = backends.value.find((b) => b.id === backendId);
      console.log(`[haex-files] Backend test ${success ? "passed" : "failed"}: ${backend?.name}`);

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      testResult.value = { backendId, success: false, error: errorMessage };
      console.error(`[haex-files] Backend test error:`, error);
      return false;
    } finally {
      testingBackendId.value = null;
    }
  };

  /**
   * Get a backend by ID
   */
  const getBackend = (backendId: string): StorageBackendInfo | undefined => {
    return backends.value.find((b) => b.id === backendId);
  };

  return {
    backends: computed(() => backends.value),
    isLoading: computed(() => isLoading.value),
    testingBackendId: computed(() => testingBackendId.value),
    testResult: computed(() => testResult.value),
    loadBackendsAsync,
    addBackendAsync,
    removeBackendAsync,
    testBackendAsync,
    getBackend,
  };
});
