import { eq, isNull } from "drizzle-orm";
import {
  haexPasswordsGroupItems,
  haexPasswordsItemDetails,
  haexPasswordsItemKeyValues,
  haexPasswordsItemSnapshots,
  haexPasswordsItemBinaries,
  haexPasswordsBinaries,
  type InsertHaexPasswordsItemDetails,
  type InserthaexPasswordsItemKeyValues,
  type SelectHaexPasswordsGroupItems,
  type SelectHaexPasswordsGroups,
  type SelectHaexPasswordsItemDetails,
  type SelectHaexPasswordsItemKeyValues,
  type SelectHaexPasswordsItemSnapshots,
} from "~/database";
import { getSingleRouteParam } from "~/utils/helper";
import type { AttachmentWithSize } from "~/types/attachment";

export const usePasswordItemStore = defineStore("passwordItemStore", () => {
  const currentItemId = computed({
    get: () =>
      getSingleRouteParam(useRouter().currentRoute.value.params.itemId),
    set: (entryId) => {
      useRouter().currentRoute.value.params.entryId = entryId ?? "";
    },
  });

  const currentItem = ref<{
    details: SelectHaexPasswordsItemDetails;
    snapshots: SelectHaexPasswordsItemSnapshots[];
    keyValues: SelectHaexPasswordsItemKeyValues[];
    attachments: AttachmentWithSize[];
  } | null>(null);

  // Watch currentItemId and update currentItem
  watch(
    currentItemId,
    async (newId) => {
      if (newId) {
        currentItem.value = await readAsync(newId);
      } else {
        currentItem.value = null;
      }
    },
    { immediate: false }
  );

  const items = ref<
    {
      haex_passwords_item_details: SelectHaexPasswordsItemDetails;
      haex_passwords_group_items: SelectHaexPasswordsGroupItems;
    }[]
  >([]);

  const syncItemsAsync = async () => {
    const haexhubStore = useHaexVaultStore();
    if (!haexhubStore.orm) throw new Error("Database not initialized");

    const result = await haexhubStore.orm
      .select()
      .from(haexPasswordsItemDetails)
      .innerJoin(
        haexPasswordsGroupItems,
        eq(haexPasswordsItemDetails.id, haexPasswordsGroupItems.itemId)
      );

    // Type assertion needed for sqlite-proxy join results
    items.value = result as unknown as typeof items.value;
  };

  const prepareDeleteItems = (selectedIds: string[]) => {
    const { isGroupInTrash } = useGroupTreeStore();

    // Check which items are in trash by checking their group
    const itemsInTrash = selectedIds.filter((itemId) => {
      const item = items.value.find((item) => item.haex_passwords_item_details.id === itemId);
      const groupId = item?.haex_passwords_group_items.groupId;
      return groupId ? isGroupInTrash(groupId) : false;
    });

    const itemsNotInTrash = selectedIds.filter((itemId) => !itemsInTrash.includes(itemId));

    // Determine which items to delete and if it's final
    if (itemsNotInTrash.length > 0) {
      // If any items are not in trash, only delete those (move to trash)
      return {
        itemsToDelete: itemsNotInTrash,
        isFinal: false,
      };
    } else {
      // All items are in trash - final delete
      return {
        itemsToDelete: itemsInTrash,
        isFinal: true,
      };
    }
  };

  return {
    currentItemId,
    currentItem,
    addAsync,
    addKeyValueAsync,
    addKeyValuesAsync,
    deleteAsync,
    deleteKeyValueAsync,
    items,
    prepareDeleteItems,
    readByGroupIdAsync,
    readAsync,
    readKeyValuesAsync,
    readSnapshotsAsync,
    readAttachmentsAsync,
    syncItemsAsync,
    updateAsync,
  };
});

const addAsync = async (
  details: SelectHaexPasswordsItemDetails,
  keyValues: SelectHaexPasswordsItemKeyValues[],
  group?: SelectHaexPasswordsGroups | null
) => {
  const haexhubStore = useHaexVaultStore();

  const newDetails: InsertHaexPasswordsItemDetails = {
    id: details.id || crypto.randomUUID(),
    icon: details.icon || group?.icon || null,
    color: details.color || group?.color || null,
    note: details.note,
    password: details.password,
    tags: details.tags,
    title: details.title,
    url: details.url,
    username: details.username,
    otpSecret: details.otpSecret,
  };

  const newKeyValues: InserthaexPasswordsItemKeyValues[] = keyValues.map(
    (keyValue) => ({
      id: crypto.randomUUID(),
      itemId: newDetails.id,
      key: keyValue.key,
      value: keyValue.value,
    })
  );

  try {
    if (!haexhubStore.orm) throw new Error("Database not initialized");

    // Insert item details
    await haexhubStore.orm.insert(haexPasswordsItemDetails).values(newDetails);

    // Insert group item relation
    const groupItemData = { itemId: newDetails.id, groupId: group?.id ?? null };
    await haexhubStore.orm.insert(haexPasswordsGroupItems).values(groupItemData);

    // Insert key values if any
    if (newKeyValues.length) {
      await haexhubStore.orm
        .insert(haexPasswordsItemKeyValues)
        .values(newKeyValues);
    }

    // Create initial snapshot (no attachments on creation)
    const snapshotData = {
      title: newDetails.title,
      username: newDetails.username,
      password: newDetails.password,
      url: newDetails.url,
      note: newDetails.note,
      tags: newDetails.tags,
      otpSecret: newDetails.otpSecret,
      keyValues: newKeyValues.map(kv => ({ key: kv.key, value: kv.value })),
      attachments: [],
    };

    await haexhubStore.orm.insert(haexPasswordsItemSnapshots).values({
      id: crypto.randomUUID(),
      itemId: newDetails.id,
      snapshotData: JSON.stringify(snapshotData),
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("ERROR addItem", error);
  }

  return newDetails.id;
};

const addKeyValueAsync = async (
  item?: InserthaexPasswordsItemKeyValues | null,
  itemId?: string
) => {
  const haexhubStore = useHaexVaultStore();
  if (!haexhubStore.orm) throw new Error("Database not initialized");

  const newKeyValue: InserthaexPasswordsItemKeyValues = {
    id: crypto.randomUUID(),
    itemId: item?.itemId || itemId,
    key: item?.key,
    value: item?.value,
  };

  try {
    return await haexhubStore.orm
      .insert(haexPasswordsItemKeyValues)
      .values(newKeyValue);
  } catch (error) {
    console.error("ERROR addItem", error);
  }
};

const addKeyValuesAsync = async (
  items: InserthaexPasswordsItemKeyValues[],
  itemId?: string
) => {
  const haexhubStore = useHaexVaultStore();
  if (!haexhubStore.orm) throw new Error("Database not initialized");

  const newKeyValues: InserthaexPasswordsItemKeyValues[] = items?.map(
    (item) => ({
      id: crypto.randomUUID(),
      itemId: item.itemId || itemId,
      key: item.key,
      value: item.value,
    })
  );

  try {
    return await haexhubStore.orm
      .insert(haexPasswordsItemKeyValues)
      .values(newKeyValues);
  } catch (error) {
    console.error("ERROR addItem", error);
  }
};

const readByGroupIdAsync = async (groupId?: string | null) => {
  try {
    const haexhubStore = useHaexVaultStore();
    if (!haexhubStore.orm) throw new Error("Database not initialized");

    // Explicit column selection avoids dynamic table name keys in join results.
    // Without this, Drizzle returns { [tableName]: { ...fields } } where tableName
    // can have a prefix (e.g., "haex_passwords_item_details"), causing type issues.
    const baseQuery = haexhubStore.orm
      .select({
        id: haexPasswordsItemDetails.id,
        title: haexPasswordsItemDetails.title,
        username: haexPasswordsItemDetails.username,
        password: haexPasswordsItemDetails.password,
        url: haexPasswordsItemDetails.url,
        note: haexPasswordsItemDetails.note,
        icon: haexPasswordsItemDetails.icon,
        color: haexPasswordsItemDetails.color,
        tags: haexPasswordsItemDetails.tags,
        otpSecret: haexPasswordsItemDetails.otpSecret,
      })
      .from(haexPasswordsGroupItems)
      .innerJoin(
        haexPasswordsItemDetails,
        eq(haexPasswordsItemDetails.id, haexPasswordsGroupItems.itemId)
      );

    const result = groupId
      ? await baseQuery.where(eq(haexPasswordsGroupItems.groupId, groupId))
      : await baseQuery.where(isNull(haexPasswordsGroupItems.groupId));

    return result as SelectHaexPasswordsItemDetails[];
  } catch (error) {
    console.error(error);
    return [];
  }
};

const readAsync = async (itemId: string | null) => {
  if (!itemId) return null;

  try {
    const haexhubStore = useHaexVaultStore();
    if (!haexhubStore.orm) throw new Error("Database not initialized");

    const result = await haexhubStore.orm
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

const readKeyValuesAsync = async (itemId: string | null) => {
  if (!itemId) return null;
  const haexhubStore = useHaexVaultStore();
  if (!haexhubStore.orm) throw new Error("Database not initialized");

  const keyValues = await haexhubStore.orm
    .select()
    .from(haexPasswordsItemKeyValues)
    .where(eq(haexPasswordsItemKeyValues.itemId, itemId));

  return keyValues;
};

const readSnapshotsAsync = async (itemId: string | null) => {
  if (!itemId) return [];
  const haexhubStore = useHaexVaultStore();
  if (!haexhubStore.orm) throw new Error("Database not initialized");

  const snapshots = await haexhubStore.orm
    .select()
    .from(haexPasswordsItemSnapshots)
    .where(eq(haexPasswordsItemSnapshots.itemId, itemId));

  return snapshots;
};

const readAttachmentsAsync = async (itemId: string | null) => {
  if (!itemId) return [];
  const haexhubStore = useHaexVaultStore();
  if (!haexhubStore.orm) throw new Error("Database not initialized");

  const result = await haexhubStore.orm
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

const updateAsync = async ({
  details,
  keyValues,
  keyValuesAdd,
  keyValuesDelete,
  attachments,
  attachmentsToAdd,
  attachmentsToDelete,
  groupId,
}: {
  details: SelectHaexPasswordsItemDetails;
  keyValues: SelectHaexPasswordsItemKeyValues[];
  keyValuesAdd: SelectHaexPasswordsItemKeyValues[];
  keyValuesDelete: SelectHaexPasswordsItemKeyValues[];
  attachments?: AttachmentWithSize[];
  attachmentsToAdd?: AttachmentWithSize[];
  attachmentsToDelete?: AttachmentWithSize[];
  groupId?: string | null;
}) => {
  console.log('[Store] updateAsync called with details.id:', details.id);
  const haexhubStore = useHaexVaultStore();

  if (!details.id) {
    console.log('[Store] updateAsync - early return, no details.id');
    return;
  }

  console.log('[Store] updateAsync - orm available:', !!haexhubStore.orm);

  // Don't include id in SET clause - only use it in WHERE
  const updateDetails = {
    icon: details.icon,
    color: details.color,
    note: details.note,
    password: details.password,
    tags: details.tags,
    title: details.title,
    url: details.url,
    username: details.username,
    otpSecret: details.otpSecret,
  };

  const newKeyValues: InserthaexPasswordsItemKeyValues[] = keyValues
    .map((keyValue) => ({
      id: keyValue.id,
      itemId: details.id,
      key: keyValue.key,
      value: keyValue.value,
    }))
    .filter((keyValue) => keyValue.id);

  const newKeyValuesAdd: InserthaexPasswordsItemKeyValues[] = keyValuesAdd.map(
    (keyValue) => ({
      id: keyValue.id || crypto.randomUUID(),
      itemId: details.id,
      key: keyValue.key,
      value: keyValue.value,
    })
  );

  try {
    if (!haexhubStore.orm) throw new Error("Database not initialized");

    console.log('[Store] updateAsync - updating item details:', updateDetails);

    // Update item details
    const updateResult = await haexhubStore.orm
      .update(haexPasswordsItemDetails)
      .set(updateDetails)
      .where(eq(haexPasswordsItemDetails.id, details.id));

    console.log('[Store] updateAsync - update result:', updateResult);

    // Update group item relation (only if groupId is explicitly provided)
    if (groupId !== undefined) {
      await haexhubStore.orm
        .update(haexPasswordsGroupItems)
        .set({ itemId: details.id, groupId })
        .where(eq(haexPasswordsGroupItems.itemId, details.id));
    }

    // Update existing key values
    for (const keyValue of newKeyValues) {
      await haexhubStore.orm
        .update(haexPasswordsItemKeyValues)
        .set(keyValue)
        .where(eq(haexPasswordsItemKeyValues.id, keyValue.id));
    }

    // Add new key values
    if (newKeyValuesAdd.length) {
      await haexhubStore.orm
        .insert(haexPasswordsItemKeyValues)
        .values(newKeyValuesAdd);
    }

    // Delete key values
    for (const keyValue of keyValuesDelete) {
      await haexhubStore.orm
        .delete(haexPasswordsItemKeyValues)
        .where(eq(haexPasswordsItemKeyValues.id, keyValue.id));
    }

    // Update existing attachments (e.g., fileName changes)
    if (attachments && attachments.length) {
      for (const attachment of attachments) {
        await haexhubStore.orm
          .update(haexPasswordsItemBinaries)
          .set({
            fileName: attachment.fileName,
            binaryHash: attachment.binaryHash,
          })
          .where(eq(haexPasswordsItemBinaries.id, attachment.id));
      }
    }

    // Add new attachments
    if (attachmentsToAdd && attachmentsToAdd.length) {
      for (const attachment of attachmentsToAdd) {
        // Get base64 data from the temporary attachment object
        const base64Data = attachment.data;

        if (!base64Data) {
          console.warn("Attachment has no data:", attachment.fileName);
          continue;
        }

        // Calculate SHA-256 hash of the binary data
        const encoder = new TextEncoder();
        const data = encoder.encode(base64Data);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const binaryHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Insert binary data (deduplicated by hash)
        try {
          await haexhubStore.orm
            .insert(haexPasswordsBinaries)
            .values({
              hash: binaryHash,
              data: base64Data,
              size: attachment.size || 0,
            });
        } catch (error) {
          // Ignore duplicate key error - binary already exists
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!errorMsg.includes("UNIQUE constraint") && !errorMsg.includes("unique constraint")) {
            console.error("Error inserting binary:", error);
            throw error;
          }
          // Binary already exists, continue with mapping
          console.log(`[Store] Binary with hash ${binaryHash} already exists, skipping insert`);
        }

        // Insert item-binary mapping
        await haexhubStore.orm
          .insert(haexPasswordsItemBinaries)
          .values({
            id: crypto.randomUUID(),
            itemId: details.id,
            binaryHash,
            fileName: attachment.fileName,
          });
      }
    }

    // Delete attachments
    if (attachmentsToDelete && attachmentsToDelete.length) {
      for (const attachment of attachmentsToDelete) {
        await haexhubStore.orm
          .delete(haexPasswordsItemBinaries)
          .where(eq(haexPasswordsItemBinaries.id, attachment.id));
      }
    }

    // Create snapshot AFTER all changes (including attachments)
    // Load all current attachments from DB to get correct binaryHash values
    const currentAttachments = await haexhubStore.orm
      .select()
      .from(haexPasswordsItemBinaries)
      .where(eq(haexPasswordsItemBinaries.itemId, details.id));

    const allKeyValues = [...newKeyValues, ...newKeyValuesAdd];
    const snapshotData = {
      title: details.title,
      username: details.username,
      password: details.password,
      url: details.url,
      note: details.note,
      tags: details.tags,
      otpSecret: details.otpSecret,
      keyValues: allKeyValues.map(kv => ({ key: kv.key, value: kv.value })),
      attachments: currentAttachments.map(att => ({
        fileName: att.fileName,
        binaryHash: att.binaryHash
      })),
    };

    await haexhubStore.orm.insert(haexPasswordsItemSnapshots).values({
      id: crypto.randomUUID(),
      itemId: details.id,
      snapshotData: JSON.stringify(snapshotData),
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    });

    return details.id;
  } catch (error) {
    console.error("ERROR updateItem", error);
    throw error;
  }
};

const deleteAsync = async (itemId: string, final: boolean = false) => {
  const haexhubStore = useHaexVaultStore();
  if (!haexhubStore.orm) throw new Error("Database not initialized");

  const { createTrashIfNotExistsAsync, trashId } = useGroupItemsDeleteStore();

  if (final) {
    try {
      // Delete key values
      await haexhubStore.orm
        .delete(haexPasswordsItemKeyValues)
        .where(eq(haexPasswordsItemKeyValues.itemId, itemId));

      // Delete snapshots (cascade will handle snapshot binaries)
      await haexhubStore.orm
        .delete(haexPasswordsItemSnapshots)
        .where(eq(haexPasswordsItemSnapshots.itemId, itemId));

      // Delete attachments (cascade will handle binaries)
      await haexhubStore.orm
        .delete(haexPasswordsItemBinaries)
        .where(eq(haexPasswordsItemBinaries.itemId, itemId));

      // Delete group items
      await haexhubStore.orm
        .delete(haexPasswordsGroupItems)
        .where(eq(haexPasswordsGroupItems.itemId, itemId));

      // Delete item details
      await haexhubStore.orm
        .delete(haexPasswordsItemDetails)
        .where(eq(haexPasswordsItemDetails.id, itemId));
    } catch (error) {
      console.error("ERROR deleteItem", error);
      throw error;
    }
  } else {
    if (await createTrashIfNotExistsAsync()) {
      await haexhubStore.orm
        .update(haexPasswordsGroupItems)
        .set({ groupId: trashId })
        .where(eq(haexPasswordsGroupItems.itemId, itemId));
    }
  }
};

const deleteKeyValueAsync = async (id: string) => {
  const haexhubStore = useHaexVaultStore();
  if (!haexhubStore.orm) throw new Error("Database not initialized");

  return await haexhubStore.orm
    .delete(haexPasswordsItemKeyValues)
    .where(eq(haexPasswordsItemKeyValues.id, id));
};
