// stores/spaces.ts
import type { FileSpace } from "@haex-space/vault-sdk";

// Re-export FileSpace type for convenience
export type { FileSpace };

// Local Space type that extends FileSpace with optional description
export interface Space extends FileSpace {
  description?: string | null;
}

export const useSpacesStore = defineStore("spaces", () => {
  const haexVaultStore = useHaexVaultStore();

  const spaces = ref<Space[]>([]);
  const isLoading = ref(false);

  /**
   * Load all spaces via SDK
   */
  const loadSpacesAsync = async (): Promise<void> => {
    isLoading.value = true;
    try {
      const fileSpaces = await haexVaultStore.client.filesystem.sync.listSpacesAsync();
      spaces.value = fileSpaces.map((s) => ({
        ...s,
        description: null,
      }));
    } catch (error) {
      console.warn("[haex-files] Failed to load spaces:", error);
      spaces.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Create a new space via SDK
   */
  const createSpaceAsync = async (name: string, _description?: string): Promise<Space> => {
    const newSpace = await haexVaultStore.client.filesystem.sync.createSpaceAsync({
      name,
    });

    const space: Space = {
      ...newSpace,
      description: _description ?? null,
    };

    spaces.value.push(space);
    console.log(`[haex-files] Created space: ${name} (${newSpace.id})`);

    return space;
  };

  /**
   * Delete a space via SDK
   */
  const deleteSpaceAsync = async (spaceId: string): Promise<void> => {
    await haexVaultStore.client.filesystem.sync.deleteSpaceAsync(spaceId);
    spaces.value = spaces.value.filter((s) => s.id !== spaceId);
    console.log(`[haex-files] Deleted space: ${spaceId}`);
  };

  /**
   * Get a space by ID
   */
  const getSpace = (spaceId: string): Space | undefined => {
    return spaces.value.find((s) => s.id === spaceId);
  };

  return {
    spaces: computed(() => spaces.value),
    isLoading: computed(() => isLoading.value),
    loadSpacesAsync,
    createSpaceAsync,
    deleteSpaceAsync,
    getSpace,
  };
});
