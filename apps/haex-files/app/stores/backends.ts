// stores/backends.ts
// Storages belong to the host (holzi): it keeps the connections and their credentials, asks the
// user to confirm every change in its own dialog and asks for credentials in its own window. This
// extension only proposes storages and sees them by name, provider and bucket.

import { isPermissionDeniedError, isPermissionPromptError } from "./haexvault";
import type {
  RemoteStorageBackendInfo,
  RemoteS3Proposal,
} from "@haex-space/vault-sdk";

export type StorageBackendInfo = RemoteStorageBackendInfo;

/** What a new storage on a new connection is proposed with; never credentials. */
export type StorageProposal = Omit<RemoteS3Proposal, "region"> & { region: string };

const PROVIDER_KINDS = { accessDenied: true, network: true, bucketMissing: true };

function providerFailureKind(error: unknown): string | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== 2002 ||
    !("details" in error) ||
    typeof error.details !== "object" ||
    error.details === null ||
    !("kind" in error.details) ||
    typeof error.details.kind !== "string"
  ) {
    return undefined;
  }

  return Object.hasOwn(PROVIDER_KINDS, error.details.kind)
    ? error.details.kind
    : undefined;
}

/**
 * Why a storage call failed: `cancelled` when the user cancelled or refused it in holzi (1002),
 * the provider's kind (2002, e.g. `accessDenied`, `network`, `bucketMissing`), else `other`.
 */
export function storageFailure(error: unknown): { kind: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (isPermissionDeniedError(error)) return { kind: "cancelled", message };
  const kind = providerFailureKind(error);
  if (kind) {
    return { kind, message };
  }
  return { kind: "other", message };
}

export const useBackendsStore = defineStore("backends", () => {
  const haexVaultStore = useHaexVaultStore();

  const backends = ref<StorageBackendInfo[]>([]);
  const isLoading = ref(false);
  const testingBackendId = ref<string | null>(null);
  const testResult = ref<{ backendId: string; success: boolean; kind?: string; error?: string } | null>(null);

  /**
   * Load all backends via Core remoteStorage API
   */
  const loadBackendsAsync = async (): Promise<void> => {
    isLoading.value = true;
    try {
      backends.value = await haexVaultStore.client.remoteStorage.backends.list();
      // Clear any pending permission prompt on success
      haexVaultStore.clearPermissionPrompt();
    } catch (error) {
      console.warn("[haex-files] Failed to load backends:", error);

      if (isPermissionPromptError(error)) {
        haexVaultStore.setPermissionPrompt(error, loadBackendsAsync);
      } else if (isPermissionDeniedError(error)) {
        haexVaultStore.setPermissionDenied(error);
      }

      backends.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Proposes a storage on a new connection. holzi confirms it with the user and asks for the
   * credentials in its own window; 1002 when the user cancels.
   */
  const addBackendAsync = async (
    name: string,
    proposal: StorageProposal
  ): Promise<StorageBackendInfo> => {
    const newBackend = await haexVaultStore.client.remoteStorage.backends.add({
      name,
      type: "s3",
      config: proposal,
    });

    backends.value.push(newBackend);
    console.log(`[haex-files] Added storage: ${name}`);

    return newBackend;
  };

  /**
   * Proposes another bucket at the provider of `sameAs` (a storage this extension may read): no
   * new credentials, holzi only asks to confirm.
   */
  const addOnSameProviderAsync = async (
    name: string,
    sameAs: string,
    bucket: string
  ): Promise<StorageBackendInfo> => {
    const newBackend = await haexVaultStore.client.remoteStorage.backends.add({
      name,
      type: "s3",
      sameProviderAs: sameAs,
      config: { bucket },
    });

    backends.value.push(newBackend);
    console.log(`[haex-files] Added storage: ${name}`);

    return newBackend;
  };

  /**
   * Proposes a new name or bucket; holzi confirms it with the user and offers new credentials in
   * its own window.
   */
  const updateBackendAsync = async (
    backendId: string,
    name?: string,
    bucket?: string
  ): Promise<StorageBackendInfo> => {
    const updatedBackend = await haexVaultStore.client.remoteStorage.backends.update({
      backendId,
      name,
      config: bucket ? { bucket } : undefined,
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
      const failure = storageFailure(error);
      testResult.value = { backendId, success: false, kind: failure.kind, error: failure.message };
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
    addOnSameProviderAsync,
    updateBackendAsync,
    removeBackendAsync,
    testBackendAsync,
    getBackend,
  };
});
