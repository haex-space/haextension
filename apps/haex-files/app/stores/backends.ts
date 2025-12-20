// stores/backends.ts
// Storage backends are managed centrally by haex-vault Core.
// This store wraps the remoteStorage API for convenient access.

import type {
  RemoteStorageBackendInfo,
  RemoteS3Config,
  RemoteS3PublicConfig,
  RemoteAddBackendRequest,
  RemoteUpdateBackendRequest,
} from "@haex-space/vault-sdk";

// Type aliases for clarity
export type StorageBackendInfo = RemoteStorageBackendInfo;
export type S3Config = RemoteS3Config;
export type S3PublicConfig = RemoteS3PublicConfig;
export type AddBackendRequest = RemoteAddBackendRequest;
export type UpdateBackendRequest = RemoteUpdateBackendRequest;

export const useBackendsStore = defineStore("backends", () => {
  const haexVaultStore = useHaexVaultStore();

  const backends = ref<StorageBackendInfo[]>([]);
  const isLoading = ref(false);
  const testingBackendId = ref<string | null>(null);
  const testResult = ref<{ backendId: string; success: boolean; error?: string } | null>(null);

  /**
   * Load all backends via Core remoteStorage API
   */
  const loadBackendsAsync = async (): Promise<void> => {
    isLoading.value = true;
    try {
      backends.value = await haexVaultStore.client.remoteStorage.backends.list();
    } catch (error) {
      console.warn("[haex-files] Failed to load backends:", error);
      backends.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Add a new storage backend via Core remoteStorage API
   */
  const addBackendAsync = async (
    name: string,
    type: "s3",
    config: S3Config
  ): Promise<StorageBackendInfo> => {
    const request: AddBackendRequest = {
      name,
      type,
      config,
    };
    const newBackend = await haexVaultStore.client.remoteStorage.backends.add(request);

    backends.value.push(newBackend);
    console.log(`[haex-files] Added backend: ${name} (${type})`);

    return newBackend;
  };

  /**
   * Update a storage backend via Core remoteStorage API
   * Only provided fields are updated. Credentials are preserved if not provided.
   */
  const updateBackendAsync = async (
    backendId: string,
    name?: string,
    config?: Partial<S3Config>
  ): Promise<StorageBackendInfo> => {
    const updatedBackend = await haexVaultStore.client.remoteStorage.backends.update({
      backendId,
      name,
      config,
    });

    // Update local state
    const index = backends.value.findIndex((b) => b.id === backendId);
    if (index !== -1) {
      backends.value[index] = updatedBackend;
    }

    console.log(`[haex-files] Updated backend: ${updatedBackend.name}`);
    return updatedBackend;
  };

  /**
   * Remove a backend via Core remoteStorage API
   */
  const removeBackendAsync = async (backendId: string): Promise<void> => {
    await haexVaultStore.client.remoteStorage.backends.remove(backendId);
    backends.value = backends.value.filter((b) => b.id !== backendId);
    console.log(`[haex-files] Removed backend: ${backendId}`);
  };

  /**
   * Test backend connection via Core remoteStorage API
   */
  const testBackendAsync = async (backendId: string): Promise<boolean> => {
    testingBackendId.value = backendId;
    testResult.value = null;

    try {
      await haexVaultStore.client.remoteStorage.backends.test(backendId);
      testResult.value = { backendId, success: true };

      const backend = backends.value.find((b) => b.id === backendId);
      console.log(`[haex-files] Backend test passed: ${backend?.name}`);

      return true;
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
    updateBackendAsync,
    removeBackendAsync,
    testBackendAsync,
    getBackend,
  };
});
