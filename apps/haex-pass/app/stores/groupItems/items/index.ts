import { eq } from "drizzle-orm";
import {
  haexPasswordsGroupItems,
  haexPasswordsItemDetails,
  haexPasswordsItemKeyValues,
  haexPasswordsItemSnapshots,
  haexPasswordsItemBinaries,
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
import {
  readAsync,
  readAttachmentsAsync,
  readByGroupIdAsync,
  readKeyValuesAsync,
  readSnapshotsAsync,
} from "~/utils/items/read";
import { updateAsync } from "~/utils/items/update";

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
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
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
    const { trashId } = usePasswordGroupStore();

    // Check which items are in trash
    // An item is in trash if:
    // 1. Its groupId is the trash ID directly, OR
    // 2. Its group is a child of the trash group
    const itemsInTrash = selectedIds.filter((itemId) => {
      const item = items.value.find((i) => i?.haex_passwords_item_details?.id === itemId);
      const groupId = item?.haex_passwords_group_items?.groupId;

      // Item is directly in trash folder
      if (groupId === trashId) {
        return true;
      }

      // Item is in a group that is inside trash (nested)
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

  /**
   * Restore an item from trash to a target group
   * Falls back to root if target group doesn't exist
   */
  const restoreAsync = async (itemId: string, targetGroupId: string | null = null) => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    // If a target group is specified, verify it exists and is not the trash
    let finalGroupId: string | null = null;
    if (targetGroupId) {
      const { readGroupAsync, trashId } = usePasswordGroupStore();
      const targetGroup = await readGroupAsync(targetGroupId);
      // Only use target if it exists and is not the trash
      if (targetGroup && targetGroupId !== trashId) {
        finalGroupId = targetGroupId;
      }
    }

    await haexVaultStore.orm
      .update(haexPasswordsGroupItems)
      .set({ groupId: finalGroupId })
      .where(eq(haexPasswordsGroupItems.itemId, itemId));
  };

  return {
    currentItemId,
    currentItem,
    addAsync,
    addKeyValueAsync,
    addKeyValuesAsync,
    applyIconAsync,
    applyIconToGroupItemsAsync,
    deleteAsync,
    deleteKeyValueAsync,
    items,
    prepareDeleteItems,
    readByGroupIdAsync,
    readAsync,
    readKeyValuesAsync,
    readSnapshotsAsync,
    readAttachmentsAsync,
    restoreAsync,
    syncItemsAsync,
    updateAsync,
  };
});

const addAsync = async (
  details: SelectHaexPasswordsItemDetails,
  keyValues: SelectHaexPasswordsItemKeyValues[],
  group?: SelectHaexPasswordsGroups | null
) => {
  const haexVaultStore = useHaexVaultStore();

  const newDetails: InsertHaexPasswordsItemDetails = {
    id: details.id || crypto.randomUUID(),
    icon: details.icon || group?.icon || null,
    color: details.color || group?.color || null,
    note: details.note,
    password: details.password,
    title: details.title,
    url: details.url,
    username: details.username,
    otpSecret: details.otpSecret,
    expiresAt: details.expiresAt,
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
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    // Insert item details
    await haexVaultStore.orm.insert(haexPasswordsItemDetails).values(newDetails);

    // Insert group item relation
    const groupItemData = { itemId: newDetails.id, groupId: group?.id ?? null };
    await haexVaultStore.orm.insert(haexPasswordsGroupItems).values(groupItemData);

    // Insert key values if any
    if (newKeyValues.length) {
      await haexVaultStore.orm
        .insert(haexPasswordsItemKeyValues)
        .values(newKeyValues);
    }

    // Create initial snapshot (no attachments on creation)
    // Note: Tags are stored in a separate table and will be loaded separately for history
    const snapshotData = {
      title: newDetails.title,
      username: newDetails.username,
      password: newDetails.password,
      url: newDetails.url,
      note: newDetails.note,
      otpSecret: newDetails.otpSecret,
      keyValues: newKeyValues.map(kv => ({ key: kv.key, value: kv.value })),
      attachments: [],
    };

    await haexVaultStore.orm.insert(haexPasswordsItemSnapshots).values({
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
  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.orm) throw new Error("Database not initialized");

  const newKeyValue: InserthaexPasswordsItemKeyValues = {
    id: crypto.randomUUID(),
    itemId: item?.itemId || itemId,
    key: item?.key,
    value: item?.value,
  };

  try {
    return await haexVaultStore.orm
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
  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.orm) throw new Error("Database not initialized");

  const newKeyValues: InserthaexPasswordsItemKeyValues[] = items?.map(
    (item) => ({
      id: crypto.randomUUID(),
      itemId: item.itemId || itemId,
      key: item.key,
      value: item.value,
    })
  );

  try {
    return await haexVaultStore.orm
      .insert(haexPasswordsItemKeyValues)
      .values(newKeyValues);
  } catch (error) {
    console.error("ERROR addItem", error);
  }
};

const deleteAsync = async (itemId: string, final: boolean = false) => {
  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.orm) throw new Error("Database not initialized");

  const { createTrashIfNotExistsAsync, trashId } = useGroupItemsDeleteStore();

  if (final) {
    try {
      // Delete key values
      await haexVaultStore.orm
        .delete(haexPasswordsItemKeyValues)
        .where(eq(haexPasswordsItemKeyValues.itemId, itemId));

      // Delete snapshots (cascade will handle snapshot binaries)
      await haexVaultStore.orm
        .delete(haexPasswordsItemSnapshots)
        .where(eq(haexPasswordsItemSnapshots.itemId, itemId));

      // Delete attachments (cascade will handle binaries)
      await haexVaultStore.orm
        .delete(haexPasswordsItemBinaries)
        .where(eq(haexPasswordsItemBinaries.itemId, itemId));

      // Delete group items
      await haexVaultStore.orm
        .delete(haexPasswordsGroupItems)
        .where(eq(haexPasswordsGroupItems.itemId, itemId));

      // Delete item details
      await haexVaultStore.orm
        .delete(haexPasswordsItemDetails)
        .where(eq(haexPasswordsItemDetails.id, itemId));
    } catch (error) {
      console.error("ERROR deleteItem", error);
      throw error;
    }
  } else {
    if (await createTrashIfNotExistsAsync()) {
      await haexVaultStore.orm
        .update(haexPasswordsGroupItems)
        .set({ groupId: trashId })
        .where(eq(haexPasswordsGroupItems.itemId, itemId));
    }
  }
};

const deleteKeyValueAsync = async (id: string) => {
  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.orm) throw new Error("Database not initialized");

  return await haexVaultStore.orm
    .delete(haexPasswordsItemKeyValues)
    .where(eq(haexPasswordsItemKeyValues.id, id));
};

/**
 * Apply a group's icon to all items in that group
 * @param groupId The group ID to get items from
 * @param icon The icon to apply to all items
 * @returns Number of items updated
 */
const applyIconToGroupItemsAsync = async (groupId: string, icon: string | null): Promise<number> => {
  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.orm) throw new Error("Database not initialized");

  // Get all item IDs in this group
  const groupItems = await haexVaultStore.orm
    .select({ itemId: haexPasswordsGroupItems.itemId })
    .from(haexPasswordsGroupItems)
    .where(eq(haexPasswordsGroupItems.groupId, groupId));

  if (groupItems.length === 0) return 0;

  // Update icon for all items in this group
  for (const item of groupItems) {
    if (item.itemId) {
      await haexVaultStore.orm
        .update(haexPasswordsItemDetails)
        .set({ icon })
        .where(eq(haexPasswordsItemDetails.id, item.itemId));
    }
  }

  return groupItems.length;
};

/**
 * Apply a group's icon to all items with toast notifications and sync
 * @param groupId The group ID to get items from
 * @param icon The icon to apply to all items
 */
const applyIconAsync = async (
  groupId: string,
  icon: string | null,
): Promise<void> => {
  const { toast } = await import("vue-sonner");
  const { syncItemsAsync } = usePasswordItemStore();
  const { loadCurrentGroupItemsAsync } = usePasswordGroupStore();

  try {
    const count = await applyIconToGroupItemsAsync(groupId, icon);
    if (count > 0) {
      toast.success(`Icon auf ${count} Einträge übertragen`);
      await syncItemsAsync();
      await loadCurrentGroupItemsAsync();
    } else {
      toast.info("Keine Einträge in diesem Ordner");
    }
  } catch (error) {
    console.error("Error applying icon to items:", error);
    toast.error("Fehler beim Übertragen des Icons");
  }
};
