import { eq, isNull } from "drizzle-orm";
import {
  haexPasswordsGroupItems,
  haexPasswordsItemDetails,
  haexPasswordsItemKeyValues,
  haexPasswordsItemSnapshots,
  haexPasswordsItemBinaries,
  haexPasswordsBinaries,
  type SelectHaexPasswordsItemDetails,
} from "~/database";

export const readByGroupIdAsync = async (groupId?: string | null) => {
  try {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    // Step 1: Get all group items for this group
    const groupItemsQuery = groupId
      ? haexVaultStore.orm
          .select()
          .from(haexPasswordsGroupItems)
          .where(eq(haexPasswordsGroupItems.groupId, groupId))
      : haexVaultStore.orm
          .select()
          .from(haexPasswordsGroupItems)
          .where(isNull(haexPasswordsGroupItems.groupId));

    const groupItems = await groupItemsQuery;

    if (groupItems.length === 0) {
      return [];
    }

    // Step 2: Get the item IDs
    const itemIds = groupItems
      .map((gi) => gi.itemId)
      .filter((id): id is string => id !== null);

    if (itemIds.length === 0) {
      return [];
    }

    // Step 3: Fetch item details for each ID
    const results: SelectHaexPasswordsItemDetails[] = [];
    for (const itemId of itemIds) {
      const itemResult = await haexVaultStore.orm
        .select()
        .from(haexPasswordsItemDetails)
        .where(eq(haexPasswordsItemDetails.id, itemId))
        .limit(1);

      if (itemResult[0]) {
        results.push(itemResult[0]);
      }
    }

    return results;
  } catch (error) {
    console.error('[readByGroupIdAsync] Error:', error);
    return [];
  }
};

export const readAsync = async (itemId: string | null) => {
  if (!itemId) return null;

  try {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsItemDetails)
      .where(eq(haexPasswordsItemDetails.id, itemId))
      .limit(1);

    const details = result[0] || null;

    if (!details) return null;

    const snapshots = await readSnapshotsAsync(itemId);
    const keyValues = (await readKeyValuesAsync(itemId)) ?? [];
    const attachments = await readAttachmentsAsync(itemId);

    return { details, snapshots, keyValues, attachments };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const readKeyValuesAsync = async (itemId: string | null) => {
  if (!itemId) return null;
  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.orm) throw new Error("Database not initialized");

  const keyValues = await haexVaultStore.orm
    .select()
    .from(haexPasswordsItemKeyValues)
    .where(eq(haexPasswordsItemKeyValues.itemId, itemId));

  return keyValues;
};

export const readSnapshotsAsync = async (itemId: string | null) => {
  if (!itemId) return [];
  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.orm) throw new Error("Database not initialized");

  const snapshots = await haexVaultStore.orm
    .select()
    .from(haexPasswordsItemSnapshots)
    .where(eq(haexPasswordsItemSnapshots.itemId, itemId));

  return snapshots;
};

export const readAttachmentsAsync = async (itemId: string | null) => {
  if (!itemId) return [];
  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.orm) throw new Error("Database not initialized");

  const result = await haexVaultStore.orm
    .select({
      id: haexPasswordsItemBinaries.id,
      itemId: haexPasswordsItemBinaries.itemId,
      binaryHash: haexPasswordsItemBinaries.binaryHash,
      fileName: haexPasswordsItemBinaries.fileName,
      size: haexPasswordsBinaries.size,
      data: haexPasswordsBinaries.data,
    })
    .from(haexPasswordsItemBinaries)
    .leftJoin(
      haexPasswordsBinaries,
      eq(haexPasswordsItemBinaries.binaryHash, haexPasswordsBinaries.hash)
    )
    .where(eq(haexPasswordsItemBinaries.itemId, itemId));

  console.log("[Store] readAttachmentsAsync - itemId:", itemId);
  console.log("[Store] readAttachmentsAsync - result:", result);
  console.log("[Store] readAttachmentsAsync - result count:", result.length);

  return result;
};
