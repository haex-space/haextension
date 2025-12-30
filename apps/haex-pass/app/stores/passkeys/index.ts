import { eq, and } from "drizzle-orm";
import {
  haexPasswordsPasskeys,
  type InsertHaexPasswordsPasskeys,
  type SelectHaexPasswordsPasskeys,
} from "~/database";

export const usePasskeyStore = defineStore("passkeyStore", () => {
  const passkeys = ref<SelectHaexPasswordsPasskeys[]>([]);

  /**
   * Sync all passkeys from the database
   */
  const syncPasskeysAsync = async () => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsPasskeys);

    passkeys.value = result;
  };

  /**
   * Add a new passkey to the database
   */
  const addPasskeyAsync = async (
    passkey: Omit<InsertHaexPasswordsPasskeys, "id" | "createdAt">
  ): Promise<string> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const newPasskey: InsertHaexPasswordsPasskeys = {
      id: crypto.randomUUID(),
      ...passkey,
    };

    await haexVaultStore.orm.insert(haexPasswordsPasskeys).values(newPasskey);

    // Update local state
    passkeys.value.push(newPasskey as SelectHaexPasswordsPasskeys);

    return newPasskey.id;
  };

  /**
   * Get a passkey by its ID
   */
  const getPasskeyByIdAsync = async (
    id: string
  ): Promise<SelectHaexPasswordsPasskeys | null> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsPasskeys)
      .where(eq(haexPasswordsPasskeys.id, id))
      .limit(1);

    return result[0] || null;
  };

  /**
   * Get a passkey by its credential ID
   */
  const getPasskeyByCredentialIdAsync = async (
    credentialId: string
  ): Promise<SelectHaexPasswordsPasskeys | null> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsPasskeys)
      .where(eq(haexPasswordsPasskeys.credentialId, credentialId))
      .limit(1);

    return result[0] || null;
  };

  /**
   * Get all passkeys for a specific relying party
   */
  const getPasskeysByRelyingPartyIdAsync = async (
    relyingPartyId: string
  ): Promise<SelectHaexPasswordsPasskeys[]> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsPasskeys)
      .where(eq(haexPasswordsPasskeys.relyingPartyId, relyingPartyId));

    return result;
  };

  /**
   * Get all passkeys linked to a specific password item
   */
  const getPasskeysByItemIdAsync = async (
    itemId: string
  ): Promise<SelectHaexPasswordsPasskeys[]> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsPasskeys)
      .where(eq(haexPasswordsPasskeys.itemId, itemId));

    return result;
  };

  /**
   * Get all discoverable passkeys for a relying party
   * Used for conditional mediation (autofill UI)
   */
  const getDiscoverablePasskeysByRelyingPartyIdAsync = async (
    relyingPartyId: string
  ): Promise<SelectHaexPasswordsPasskeys[]> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsPasskeys)
      .where(
        and(
          eq(haexPasswordsPasskeys.relyingPartyId, relyingPartyId),
          eq(haexPasswordsPasskeys.isDiscoverable, true)
        )
      );

    return result;
  };

  /**
   * Update the sign count after a successful authentication
   */
  const updateSignCountAsync = async (
    id: string,
    newSignCount: number
  ): Promise<void> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .update(haexPasswordsPasskeys)
      .set({
        signCount: newSignCount,
        lastUsedAt: new Date().toISOString(),
      })
      .where(eq(haexPasswordsPasskeys.id, id));

    // Update local state
    const passkey = passkeys.value.find((p) => p.id === id);
    if (passkey) {
      passkey.signCount = newSignCount;
      passkey.lastUsedAt = new Date().toISOString();
    }
  };

  /**
   * Update passkey metadata (nickname, icon, color)
   */
  const updatePasskeyAsync = async (
    id: string,
    updates: Partial<Pick<SelectHaexPasswordsPasskeys, "nickname" | "icon" | "color" | "itemId">>
  ): Promise<void> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .update(haexPasswordsPasskeys)
      .set(updates)
      .where(eq(haexPasswordsPasskeys.id, id));

    // Update local state
    const passkey = passkeys.value.find((p) => p.id === id);
    if (passkey) {
      Object.assign(passkey, updates);
    }
  };

  /**
   * Delete a passkey
   * Note: This is only available within the password manager UI, not from browser extension
   */
  const deletePasskeyAsync = async (id: string): Promise<void> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .delete(haexPasswordsPasskeys)
      .where(eq(haexPasswordsPasskeys.id, id));

    // Update local state
    passkeys.value = passkeys.value.filter((p) => p.id !== id);
  };

  /**
   * Get passkeys count for a relying party
   */
  const getPasskeysCountByRelyingPartyId = (relyingPartyId: string): number => {
    return passkeys.value.filter((p) => p.relyingPartyId === relyingPartyId).length;
  };

  return {
    passkeys,
    syncPasskeysAsync,
    addPasskeyAsync,
    getPasskeyByIdAsync,
    getPasskeyByCredentialIdAsync,
    getPasskeysByRelyingPartyIdAsync,
    getPasskeysByItemIdAsync,
    getDiscoverablePasskeysByRelyingPartyIdAsync,
    updateSignCountAsync,
    updatePasskeyAsync,
    deletePasskeyAsync,
    getPasskeysCountByRelyingPartyId,
  };
});
