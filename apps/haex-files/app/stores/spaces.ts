// stores/spaces.ts
import { eq } from "drizzle-orm";
import { spaces as spacesTable, type SelectSpace } from "~/database/schemas";
import { generateVaultKey, arrayBufferToBase64 } from "@haex-space/vault-sdk";

// Export local Space type
export type Space = SelectSpace;

export const useSpacesStore = defineStore("spaces", () => {
  const haexVaultStore = useHaexVaultStore();

  const spaces = ref<Space[]>([]);
  const isLoading = ref(false);

  /**
   * Load all spaces from local Drizzle DB
   */
  const loadSpacesAsync = async (): Promise<void> => {
    isLoading.value = true;
    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        console.warn("[haex-files] ORM not initialized");
        return;
      }

      const result = await orm.select().from(spacesTable);
      spaces.value = result;
    } catch (error) {
      console.warn("[haex-files] Failed to load spaces:", error);
      spaces.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Create a new space in local Drizzle DB
   */
  const createSpaceAsync = async (name: string, description?: string): Promise<Space> => {
    const orm = haexVaultStore.orm;
    if (!orm) {
      throw new Error("ORM not initialized");
    }

    // Generate a new space key and encode as Base64
    const spaceKey = generateVaultKey();
    const wrappedKey = arrayBufferToBase64(spaceKey);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const newSpace: Space = {
      id,
      name,
      description: description ?? null,
      wrappedKey,
      isPersonal: true,
      fileCount: 0,
      totalSize: 0,
      createdAt: now,
      updatedAt: now,
    };

    await orm.insert(spacesTable).values(newSpace);
    spaces.value.push(newSpace);

    console.log(`[haex-files] Created space: ${name} (${id})`);
    return newSpace;
  };

  /**
   * Delete a space from local Drizzle DB
   */
  const deleteSpaceAsync = async (spaceId: string): Promise<void> => {
    const orm = haexVaultStore.orm;
    if (!orm) {
      throw new Error("ORM not initialized");
    }

    await orm.delete(spacesTable).where(eq(spacesTable.id, spaceId));
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
