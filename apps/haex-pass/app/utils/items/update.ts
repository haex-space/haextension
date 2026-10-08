import { eq } from "drizzle-orm";
import {
  haexPasswordsGroupItems,
  haexPasswordsItemDetails,
  haexPasswordsItemKeyValues,
  haexPasswordsItemSnapshots,
  haexPasswordsItemBinaries,
  haexPasswordsBinaries,
  type InserthaexPasswordsItemKeyValues,
  type SelectHaexPasswordsItemDetails,
  type SelectHaexPasswordsItemKeyValues,
} from "~/database";
import type { AttachmentWithSize } from "~/types/attachment";

export const updateAsync = async ({
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
  const haexVaultStore = useHaexVaultStore();

  if (!details.id) {
    console.log('[Store] updateAsync - early return, no details.id');
    return;
  }

  console.log('[Store] updateAsync - orm available:', !!haexVaultStore.orm);

  // Don't include id in SET clause - only use it in WHERE
  const updateDetails = {
    icon: details.icon,
    color: details.color,
    note: details.note,
    password: details.password,
    title: details.title,
    url: details.url,
    username: details.username,
    otpSecret: details.otpSecret,
    expiresAt: details.expiresAt,
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
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    console.log('[Store] updateAsync - updating item details:', updateDetails);

    // Update item details
    const updateResult = await haexVaultStore.orm
      .update(haexPasswordsItemDetails)
      .set(updateDetails)
      .where(eq(haexPasswordsItemDetails.id, details.id));

    console.log('[Store] updateAsync - update result:', updateResult);

    // Update group item relation (only if groupId is explicitly provided)
    if (groupId !== undefined) {
      await haexVaultStore.orm
        .update(haexPasswordsGroupItems)
        .set({ itemId: details.id, groupId })
        .where(eq(haexPasswordsGroupItems.itemId, details.id));
    }

    // Update existing key values
    for (const keyValue of newKeyValues) {
      await haexVaultStore.orm
        .update(haexPasswordsItemKeyValues)
        .set(keyValue)
        .where(eq(haexPasswordsItemKeyValues.id, keyValue.id));
    }

    // Add new key values
    if (newKeyValuesAdd.length) {
      await haexVaultStore.orm
        .insert(haexPasswordsItemKeyValues)
        .values(newKeyValuesAdd);
    }

    // Delete key values
    for (const keyValue of keyValuesDelete) {
      await haexVaultStore.orm
        .delete(haexPasswordsItemKeyValues)
        .where(eq(haexPasswordsItemKeyValues.id, keyValue.id));
    }

    // Update existing attachments (e.g., fileName changes)
    if (attachments && attachments.length) {
      for (const attachment of attachments) {
        await haexVaultStore.orm
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
          await haexVaultStore.orm
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
        await haexVaultStore.orm
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
        await haexVaultStore.orm
          .delete(haexPasswordsItemBinaries)
          .where(eq(haexPasswordsItemBinaries.id, attachment.id));
      }
    }

    // Create snapshot AFTER all changes (including attachments)
    // Load all current attachments from DB to get correct binaryHash values
    const currentAttachments = await haexVaultStore.orm
      .select()
      .from(haexPasswordsItemBinaries)
      .where(eq(haexPasswordsItemBinaries.itemId, details.id));

    const allKeyValues = [...newKeyValues, ...newKeyValuesAdd];
    // Note: Tags are stored in a separate table and will be loaded separately for history
    const snapshotData = {
      title: details.title,
      username: details.username,
      password: details.password,
      url: details.url,
      note: details.note,
      otpSecret: details.otpSecret,
      keyValues: allKeyValues.map(kv => ({ key: kv.key, value: kv.value })),
      attachments: currentAttachments.map(att => ({
        fileName: att.fileName,
        binaryHash: att.binaryHash
      })),
    };

    await haexVaultStore.orm.insert(haexPasswordsItemSnapshots).values({
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
