import * as kdbxweb from "kdbxweb";
import type { Ref } from "vue";
import { addBinaryAsync } from "~/utils/cleanup";
import {
  haexPasswordsItemDetails,
  haexPasswordsGroupItems,
  haexPasswordsItemKeyValues,
  haexPasswordsItemBinaries,
  haexPasswordsItemSnapshots,
  haexPasswordsSnapshotBinaries,
  type SelectHaexPasswordsItemKeyValues,
} from "~/database/schemas/index";
import type * as schema from "~/database/schemas/index";
import { trashId } from "~/stores/groupItems/groups";
import {
  extractBinaryData,
  extractIconAsync,
  extractOtpFromEntry,
  getFieldValue,
  kdbxUuidToStandardUuid,
  migrateKeePassReferences,
  uint8ArrayToBase64,
} from "./kdbx";

// Type for snapshot data stored in JSON (subset of ItemDetails + keyValues)
interface ISnapshotData {
  title: string;
  username: string;
  password: string;
  url: string;
  note: string;
  icon: string | null;
  tags: string | null;
  otpSecret: string | null;
  otpDigits: number | null;
  otpPeriod: number | null;
  otpAlgorithm: string | null;
  keyValues: Array<Pick<SelectHaexPasswordsItemKeyValues, "key" | "value">>;
}

export async function importKdbxAsync(
  buffer: ArrayBuffer,
  pwd: string,
  progress: Ref<number>
): Promise<{ groupCount: number; entryCount: number }> {
  console.log("[KeePass Import] Starting import...");
  console.log("[KeePass Import] Buffer size:", buffer.byteLength);
  console.log("[KeePass Import] Password length:", pwd.length);

  const credentials = new kdbxweb.Credentials(
    kdbxweb.ProtectedValue.fromString(pwd)
  );
  console.log("[KeePass Import] Credentials created, loading database...");

  const kdbx = await kdbxweb.Kdbx.load(buffer, credentials);
  console.log("[KeePass Import] Database loaded successfully");

  const { addGroupAsync } = usePasswordGroupStore();
  const haexVaultStore = useHaexVaultStore();
  const { orm } = storeToRefs(haexVaultStore);

  if (!orm.value) {
    throw new Error("Database not initialized");
  }

  // Group mapping: KeePass UUID → haex Group ID
  const groupMapping = new Map<string, string>();

  // Identify KeePass Recycle Bin UUID (converted to standard UUID format)
  const recycleBinUuid =
    kdbx.meta.recycleBinEnabled && kdbx.meta.recycleBinUuid
      ? kdbxUuidToStandardUuid(kdbx.meta.recycleBinUuid)
      : null;

  console.log(
    "[KeePass Import] Recycle Bin enabled:",
    kdbx.meta.recycleBinEnabled
  );
  console.log("[KeePass Import] Recycle Bin UUID:", recycleBinUuid);

  // Ensure trash folder exists if KeePass has a recycle bin
  if (recycleBinUuid) {
    const { createTrashIfNotExistsAsync } = useGroupItemsDeleteStore();
    await createTrashIfNotExistsAsync();
    console.log("[KeePass Import] Ensured trash folder exists");
  }

  // Collect all groups
  const allGroups: Array<{
    group: kdbxweb.KdbxGroup;
    parentUuid: string | null;
  }> = [];

  function collectGroups(
    group: kdbxweb.KdbxGroup,
    parentUuid: string | null = null
  ) {
    // Skip Root group
    if (group.name !== "Root") {
      allGroups.push({ group, parentUuid });
    }

    for (const subGroup of group.groups) {
      collectGroups(subGroup, kdbxUuidToStandardUuid(group.uuid));
    }
  }

  collectGroups(kdbx.getDefaultGroup());

  const allEntries = Array.from(kdbx.getDefaultGroup().allEntries());
  const totalSteps = allGroups.length + allEntries.length;
  let currentStep = 0;

  // Create groups (parent groups first) - use original KeePass UUIDs
  // Map KeePass Recycle Bin to local trash folder
  for (const { group, parentUuid } of allGroups) {
    const groupUuid = kdbxUuidToStandardUuid(group.uuid);

    // Check if this group is the KeePass Recycle Bin
    const isRecycleBin = recycleBinUuid && groupUuid === recycleBinUuid;

    if (isRecycleBin) {
      // Map KeePass Recycle Bin to local trash folder (don't create a new group)
      console.log(
        "[KeePass Import] Mapping Recycle Bin to local trash:",
        group.name
      );
      groupMapping.set(groupUuid, trashId);
      currentStep++;
      progress.value = Math.round((currentStep / totalSteps) * 100);
      continue;
    }

    // Resolve parent ID using groupMapping
    // If parent was Recycle Bin, it's already mapped to trashId
    // Child folders keep their structure but are now under trashId
    const parentId = parentUuid
      ? groupMapping.get(parentUuid) || parentUuid
      : null;

    // Extract icon from KeePass
    const icon = await extractIconAsync(kdbx, group, orm.value!);

    const newGroup = await addGroupAsync({
      id: groupUuid, // Use converted KeePass UUID
      name: group.name,
      icon,
      parentId,
    });

    groupMapping.set(groupUuid, newGroup.id);
    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Import entries with attachments and history
  for (const entry of allEntries) {
    const parentGroupUuid = entry.parentGroup
      ? kdbxUuidToStandardUuid(entry.parentGroup.uuid)
      : null;
    const groupId = parentGroupUuid
      ? groupMapping.get(parentGroupUuid) || null
      : null;

    // Extract fields and migrate KeePass references
    const title = migrateKeePassReferences(
      getFieldValue(entry.fields.get("Title"))
    );
    const username = migrateKeePassReferences(
      getFieldValue(entry.fields.get("UserName"))
    );
    const password = migrateKeePassReferences(
      getFieldValue(entry.fields.get("Password"))
    );
    const url = migrateKeePassReferences(
      getFieldValue(entry.fields.get("URL"))
    );
    const notes = migrateKeePassReferences(
      getFieldValue(entry.fields.get("Notes"))
    );
    // Tags are stored separately in the tag store
    const entryTags = entry.tags || [];

    // Extract OTP data (secret, digits, period, algorithm)
    const otpData = extractOtpFromEntry(entry, notes);
    const otpSecret = otpData?.secret || null;
    const otpDigits = otpData?.digits || null;
    const otpPeriod = otpData?.period || null;
    const otpAlgorithm = otpData?.algorithm || null;

    // Custom fields (alle außer Standard-Felder)
    const keyValues: SelectHaexPasswordsItemKeyValues[] = [];
    const standardFields = new Set([
      "Title",
      "UserName",
      "Password",
      "URL",
      "Notes",
    ]);

    for (const [key, value] of entry.fields) {
      if (!standardFields.has(key) && key !== "otp" && key !== "OTP") {
        keyValues.push({
          id: crypto.randomUUID(),
          itemId: null,
          key,
          value: migrateKeePassReferences(getFieldValue(value)),
          updateAt: null,
        });
      }
    }

    // Extract icon from KeePass
    const icon = await extractIconAsync(kdbx, entry, orm.value!);

    console.log("[KeePass Import] Creating entry:", title);
    console.log(
      "[KeePass Import] Entry has",
      entry.history.length,
      "history entries"
    );

    // Create entry manually to have control over snapshot creation
    // Use converted KeePass UUID
    const newEntryId = kdbxUuidToStandardUuid(entry.uuid);

    // Insert item details
    // createdAt is a string field, updateAt is an integer timestamp field (expects Date object)
    // Handle various possible formats from KeePass: Date, number (Unix timestamp), or undefined
    let updateAtDate: Date | null = null;
    if (entry.times.lastModTime) {
      console.log(
        "[KeePass Import] lastModTime type:",
        typeof entry.times.lastModTime,
        entry.times.lastModTime
      );
      if (entry.times.lastModTime instanceof Date) {
        updateAtDate = entry.times.lastModTime;
      } else if (typeof entry.times.lastModTime === "number") {
        // Unix timestamp in seconds, convert to Date
        updateAtDate = new Date(entry.times.lastModTime * 1000);
      } else {
        updateAtDate = new Date(entry.times.lastModTime as unknown as string);
      }
      console.log("[KeePass Import] updateAtDate:", updateAtDate);
    }

    // Extract expiry time if set and expiry is enabled
    let expiresAt: string | null = null;
    if (entry.times.expires && entry.times.expiryTime) {
      expiresAt =
        new Date(entry.times.expiryTime).toISOString().split("T")[0] || null; // Store as YYYY-MM-DD
      console.log("[KeePass Import] Entry expires at:", expiresAt);
    }

    await orm.value!.insert(haexPasswordsItemDetails).values({
      id: newEntryId,
      title,
      username,
      password,
      url,
      note: notes,
      otpSecret,
      otpDigits,
      otpPeriod,
      otpAlgorithm,
      icon,
      color: null,
      expiresAt,
      createdAt: entry.times.creationTime
        ? new Date(entry.times.creationTime).toISOString()
        : null,
      updateAt: updateAtDate,
    });

    // Insert group item relation
    await orm.value!.insert(haexPasswordsGroupItems).values({
      itemId: newEntryId,
      groupId: groupId || null,
    });

    // Insert key values
    if (keyValues.length > 0) {
      await orm.value!.insert(haexPasswordsItemKeyValues).values(
        keyValues.map((kv) => ({
          id: crypto.randomUUID(),
          itemId: newEntryId,
          key: kv.key,
          value: kv.value,
        }))
      );
    }

    // Import tags using tag store
    const tagStore = useTagStore();
    for (const tagName of entryTags) {
      if (tagName && tagName.trim()) {
        await tagStore.addTagToItemAsync(newEntryId, tagName.trim());
      }
    }

    console.log("[KeePass Import] Created entry with ID:", newEntryId);

    // Attachments importieren
    for (const [fileName, binary] of entry.binaries) {
      console.log(`[KeePass Import] Processing binary: ${fileName}`);
      console.log(`[KeePass Import] Binary object:`, binary);

      const uint8Array = extractBinaryData(binary);

      console.log(`[KeePass Import] Uint8Array:`, uint8Array);
      console.log(`[KeePass Import] Uint8Array length:`, uint8Array.length);

      // Skip empty binaries
      if (uint8Array.length === 0) {
        console.warn(`[KeePass Import] Skipping empty binary: ${fileName}`);
        continue;
      }

      // Convert to Base64
      const base64 = uint8ArrayToBase64(uint8Array);

      // Binary hinzufügen (dedupliziert via Hash)
      const hash = await addBinaryAsync(orm.value!, base64, uint8Array.length);

      // Entry → Binary Mapping
      await orm.value!.insert(haexPasswordsItemBinaries).values({
        id: crypto.randomUUID(),
        itemId: newEntryId,
        binaryHash: hash,
        fileName,
      });
    }

    // Entry History importieren
    console.log(
      "[KeePass Import] Importing",
      entry.history.length,
      "history entries for:",
      title
    );
    for (let i = 0; i < entry.history.length; i++) {
      const historyEntry = entry.history[i];
      if (!historyEntry) {
        console.warn(
          `[KeePass Import] Skipping undefined history entry ${i + 1}`
        );
        continue;
      }

      console.log(
        `[KeePass Import] Processing history entry ${i + 1}/${
          entry.history.length
        }`
      );

      // Extract icon from history entry
      const historyIcon = await extractIconAsync(
        kdbx,
        historyEntry,
        orm.value!
      );

      // Extract OTP data from history entry
      const historyNotes = getFieldValue(historyEntry.fields.get("Notes"));
      const historyOtpData = extractOtpFromEntry(historyEntry, historyNotes);

      const snapshotData: ISnapshotData = {
        title: getFieldValue(historyEntry.fields.get("Title")),
        username: getFieldValue(historyEntry.fields.get("UserName")),
        password: getFieldValue(historyEntry.fields.get("Password")),
        url: getFieldValue(historyEntry.fields.get("URL")),
        note: historyNotes,
        icon: historyIcon,
        tags: historyEntry.tags?.join(", ") || null,
        otpSecret: historyOtpData?.secret || null,
        otpDigits: historyOtpData?.digits || null,
        otpPeriod: historyOtpData?.period || null,
        otpAlgorithm: historyOtpData?.algorithm || null,
        keyValues: [],
      };

      // Custom fields in Snapshot
      for (const [key, value] of historyEntry.fields) {
        if (!standardFields.has(key)) {
          snapshotData.keyValues.push({
            key,
            value: getFieldValue(value),
          });
        }
      }

      const snapshotId = crypto.randomUUID();

      // Build the values object with proper string type for snapshotData
      const snapshotDataString = JSON.stringify(snapshotData);

      const snapshotValues: schema.InsertHaexPasswordsItemSnapshots = {
        id: snapshotId,
        itemId: newEntryId,
        snapshotData: snapshotDataString,
        createdAt: historyEntry?.times.creationTime
          ? new Date(historyEntry.times.creationTime).toISOString()
          : new Date().toISOString(),
        modifiedAt: historyEntry?.times.lastModTime
          ? new Date(historyEntry.times.lastModTime).toISOString()
          : null,
      };

      console.log(`[KeePass Import] Inserting snapshot ${i + 1}:`, {
        id: snapshotValues.id,
        itemId: snapshotValues.itemId,
        snapshotDataType: typeof snapshotValues.snapshotData,
        snapshotDataLength: snapshotValues.snapshotData.length,
        createdAt: snapshotValues.createdAt,
        modifiedAt: snapshotValues.modifiedAt,
      });

      let snapshot;
      try {
        // Use Drizzle ORM with .returning() - SDK v1.9.0+ supports this correctly
        snapshot = await orm
          .value!.insert(haexPasswordsItemSnapshots)
          .values({
            id: snapshotId,
            itemId: newEntryId,
            snapshotData: snapshotDataString,
            createdAt: snapshotValues.createdAt,
            modifiedAt: snapshotValues.modifiedAt,
          })
          .returning();

        console.log(
          `[KeePass Import] Successfully inserted snapshot ${i + 1}/${
            entry.history.length
          }`
        );
      } catch (err) {
        console.error(
          `[KeePass Import] Failed to insert snapshot ${i + 1}:`,
          err
        );
        throw err;
      }

      // History Attachments
      if (snapshot && snapshot[0]) {
        for (const [fileName, binary] of historyEntry.binaries) {
          const uint8Array = extractBinaryData(binary);

          // Skip empty binaries
          if (uint8Array.length === 0) {
            console.warn(
              `[KeePass Import] Skipping empty history binary: ${fileName}`
            );
            continue;
          }

          // Convert to Base64
          const base64 = uint8ArrayToBase64(uint8Array);

          const hash = await addBinaryAsync(
            orm.value!,
            base64,
            uint8Array.length
          );

          await orm.value!.insert(haexPasswordsSnapshotBinaries).values({
            id: crypto.randomUUID(),
            snapshotId: snapshot[0].id,
            binaryHash: hash,
            fileName,
          });
        }
      }
    }

    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Sync data
  const { syncGroupItemsAsync } = usePasswordGroupStore();
  await syncGroupItemsAsync();

  return {
    groupCount: allGroups.length,
    entryCount: allEntries.length,
  };
}
