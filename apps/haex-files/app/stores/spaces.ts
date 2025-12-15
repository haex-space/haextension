// stores/spaces.ts
import { eq } from "drizzle-orm";
import * as schema from "~/database/schemas";
import {
  generateVaultKey,
  wrapKey,
  unwrapKey,
} from "@haex-space/vault-sdk";

export interface Space {
  id: string;
  name: string;
  description: string | null;
  isPersonal: boolean;
  fileCount: number;
  totalSize: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export const useSpacesStore = defineStore("spaces", () => {
  const haexVaultStore = useHaexVaultStore();

  const spaces = ref<Space[]>([]);
  const isLoading = ref(false);

  /**
   * Load all spaces from database
   */
  const loadSpacesAsync = async (): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    isLoading.value = true;
    try {
      const rows = await haexVaultStore.orm
        .select({
          id: schema.spaces.id,
          name: schema.spaces.name,
          description: schema.spaces.description,
          isPersonal: schema.spaces.isPersonal,
          fileCount: schema.spaces.fileCount,
          totalSize: schema.spaces.totalSize,
          createdAt: schema.spaces.createdAt,
          updatedAt: schema.spaces.updatedAt,
        })
        .from(schema.spaces);

      spaces.value = rows;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Create a new space with its own encryption key
   */
  const createSpaceAsync = async (name: string, description?: string): Promise<Space> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const masterKey = haexVaultStore.getMasterKey();

    // Generate a new key for this space
    const spaceKey = generateVaultKey();

    // Wrap (encrypt) the space key with the master key
    const wrappedKey = await wrapKey(spaceKey, masterKey);

    // Generate unique ID
    const id = crypto.randomUUID();

    // Insert into database
    await haexVaultStore.orm.insert(schema.spaces).values({
      id,
      name,
      description: description ?? null,
      wrappedKey: Buffer.from(wrappedKey),
      isPersonal: true,
      fileCount: 0,
      totalSize: 0,
    });

    const newSpace: Space = {
      id,
      name,
      description: description ?? null,
      isPersonal: true,
      fileCount: 0,
      totalSize: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    spaces.value.push(newSpace);

    console.log(`[haex-files] Created space: ${name} (${id})`);

    return newSpace;
  };

  /**
   * Get the decrypted key for a space
   */
  const getSpaceKeyAsync = async (spaceId: string): Promise<Uint8Array> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const masterKey = haexVaultStore.getMasterKey();

    // Load wrapped key from database
    const [row] = await haexVaultStore.orm
      .select({ wrappedKey: schema.spaces.wrappedKey })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, spaceId))
      .limit(1);

    if (!row) {
      throw new Error(`Space not found: ${spaceId}`);
    }

    // Unwrap (decrypt) the space key with the master key
    const spaceKey = await unwrapKey(new Uint8Array(row.wrappedKey), masterKey);

    return spaceKey;
  };

  /**
   * Delete a space and all its files
   */
  const deleteSpaceAsync = async (spaceId: string): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .delete(schema.spaces)
      .where(eq(schema.spaces.id, spaceId));

    spaces.value = spaces.value.filter((s) => s.id !== spaceId);

    console.log(`[haex-files] Deleted space: ${spaceId}`);
  };

  /**
   * Update space metadata
   */
  const updateSpaceAsync = async (
    spaceId: string,
    updates: { name?: string; description?: string }
  ): Promise<void> => {
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .update(schema.spaces)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.spaces.id, spaceId));

    // Update local state
    const space = spaces.value.find((s) => s.id === spaceId);
    if (space) {
      if (updates.name) space.name = updates.name;
      if (updates.description !== undefined) space.description = updates.description;
      space.updatedAt = new Date().toISOString();
    }
  };

  return {
    spaces: computed(() => spaces.value),
    isLoading: computed(() => isLoading.value),
    loadSpacesAsync,
    createSpaceAsync,
    getSpaceKeyAsync,
    deleteSpaceAsync,
    updateSpaceAsync,
  };
});
