import type { Ref } from "vue";
import {
  haexPasswordsItemDetails,
  haexPasswordsGroupItems,
  haexPasswordsItemKeyValues,
} from "~/database/schemas/index";
import { parseOtpData } from "./bitwardenOtp";

// Bitwarden JSON format
interface BitwardenJsonExport {
  encrypted?: boolean;
  folders?: Array<{
    id: string;
    name: string;
  }>;
  items?: Array<{
    id: string;
    organizationId?: string | null;
    folderId?: string | null;
    type: number; // 1 = Login, 2 = SecureNote, 3 = Card, 4 = Identity
    reprompt: number;
    name: string;
    notes?: string | null;
    favorite: boolean;
    login?: {
      uris?: Array<{
        match?: number | null;
        uri: string;
      }>;
      username?: string | null;
      password?: string | null;
      totp?: string | null;
    };
    card?: {
      cardholderName?: string | null;
      brand?: string | null;
      number?: string | null;
      expMonth?: string | null;
      expYear?: string | null;
      code?: string | null;
    };
    identity?: {
      title?: string | null;
      firstName?: string | null;
      middleName?: string | null;
      lastName?: string | null;
      address1?: string | null;
      address2?: string | null;
      address3?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
      company?: string | null;
      email?: string | null;
      phone?: string | null;
      ssn?: string | null;
      username?: string | null;
      passportNumber?: string | null;
      licenseNumber?: string | null;
    };
    secureNote?: {
      type: number;
    };
    fields?: Array<{
      name: string;
      value: string;
      type: number; // 0 = Text, 1 = Hidden, 2 = Boolean
      linkedId?: number | null;
    }>;
    collectionIds?: string[] | null;
  }>;
}

export async function importBitwardenJsonAsync(
  jsonText: string,
  progress: Ref<number>,
  t: (key: string) => string
): Promise<{ folderCount: number; entryCount: number }> {
  const data: BitwardenJsonExport = JSON.parse(jsonText);

  if (data.encrypted) {
    throw new Error(t("error.encrypted"));
  }

  const { addGroupAsync } = usePasswordGroupStore();
  const haexVaultStore = useHaexVaultStore();
  const { orm } = storeToRefs(haexVaultStore);
  const tagStore = useTagStore();

  if (!orm.value) {
    throw new Error("Database not initialized");
  }

  // Create folder mapping
  const folderMapping = new Map<string, string>();
  const folders = data.folders || [];
  const items = data.items || [];

  const totalSteps = folders.length + items.length;
  let currentStep = 0;

  // Import folders
  for (const folder of folders) {
    const newGroup = await addGroupAsync({
      id: crypto.randomUUID(),
      name: folder.name,
      icon: "folder",
      parentId: null,
    });
    folderMapping.set(folder.id, newGroup.id);
    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Import items
  for (const item of items) {
    const groupId = item.folderId ? folderMapping.get(item.folderId) : null;
    const newEntryId = crypto.randomUUID();

    // Handle different item types
    if (item.type === 1) {
      // Login type
      const url = item.login?.uris?.[0]?.uri || "";
      const otpData = parseOtpData(item.login?.totp);

      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: item.name,
        username: item.login?.username || "",
        password: item.login?.password || "",
        url,
        note: item.notes || "",
        otpSecret: otpData?.secret || null,
        otpDigits: otpData?.digits || null,
        otpPeriod: otpData?.period || null,
        otpAlgorithm: otpData?.algorithm || null,
        icon: item.favorite ? "star" : null,
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Import custom fields
      if (item.fields && item.fields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.fields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.name,
            value: field.value,
          }))
        );
      }

      // Import additional URIs as custom fields
      if (item.login?.uris && item.login.uris.length > 1) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.login.uris.slice(1).map((uri, idx) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: `URL ${idx + 2}`,
            value: uri.uri,
          }))
        );
      }
    } else if (item.type === 2) {
      // SecureNote type
      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: item.name,
        username: "",
        password: "",
        url: "",
        note: item.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: item.favorite ? "star" : "file-text",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add secure-note tag
      await tagStore.addTagToItemAsync(newEntryId, "secure-note");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Import custom fields
      if (item.fields && item.fields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.fields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.name,
            value: field.value,
          }))
        );
      }
    } else if (item.type === 3) {
      // Card type
      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: item.name,
        username: item.card?.cardholderName || "",
        password: item.card?.number || "",
        url: "",
        note: item.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: item.favorite ? "star" : "credit-card",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add credit-card tag
      await tagStore.addTagToItemAsync(newEntryId, "credit-card");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Store card details as custom fields
      const cardFields: Array<{ key: string; value: string }> = [];
      if (item.card?.brand) cardFields.push({ key: "Brand", value: item.card.brand });
      if (item.card?.number) cardFields.push({ key: "Card Number", value: item.card.number });
      if (item.card?.expMonth) cardFields.push({ key: "Expiration Month", value: item.card.expMonth });
      if (item.card?.expYear) cardFields.push({ key: "Expiration Year", value: item.card.expYear });
      if (item.card?.code) cardFields.push({ key: "CVV", value: item.card.code });

      if (cardFields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          cardFields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.key,
            value: field.value,
          }))
        );
      }

      // Import additional custom fields
      if (item.fields && item.fields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.fields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.name,
            value: field.value,
          }))
        );
      }
    } else if (item.type === 4) {
      // Identity type
      const fullName = [
        item.identity?.firstName,
        item.identity?.middleName,
        item.identity?.lastName,
      ]
        .filter(Boolean)
        .join(" ");

      await orm.value.insert(haexPasswordsItemDetails).values({
        id: newEntryId,
        title: item.name,
        username: item.identity?.username || item.identity?.email || "",
        password: "",
        url: "",
        note: item.notes || "",
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: item.favorite ? "star" : "user",
        color: null,
        createdAt: new Date().toISOString(),
        updateAt: new Date(),
      });

      // Add identity tag
      await tagStore.addTagToItemAsync(newEntryId, "identity");

      await orm.value.insert(haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Store identity details as custom fields
      const identityFields: Array<{ key: string; value: string }> = [];
      if (item.identity?.title) identityFields.push({ key: "Title", value: item.identity.title });
      if (fullName) identityFields.push({ key: "Full Name", value: fullName });
      if (item.identity?.firstName) identityFields.push({ key: "First Name", value: item.identity.firstName });
      if (item.identity?.middleName) identityFields.push({ key: "Middle Name", value: item.identity.middleName });
      if (item.identity?.lastName) identityFields.push({ key: "Last Name", value: item.identity.lastName });
      if (item.identity?.email) identityFields.push({ key: "Email", value: item.identity.email });
      if (item.identity?.phone) identityFields.push({ key: "Phone", value: item.identity.phone });
      if (item.identity?.company) identityFields.push({ key: "Company", value: item.identity.company });
      if (item.identity?.ssn) identityFields.push({ key: "SSN", value: item.identity.ssn });
      if (item.identity?.passportNumber) identityFields.push({ key: "Passport Number", value: item.identity.passportNumber });
      if (item.identity?.licenseNumber) identityFields.push({ key: "License Number", value: item.identity.licenseNumber });

      // Address fields
      const addressParts = [
        item.identity?.address1,
        item.identity?.address2,
        item.identity?.address3,
      ].filter(Boolean);
      if (addressParts.length > 0) identityFields.push({ key: "Address", value: addressParts.join("\n") });
      if (item.identity?.city) identityFields.push({ key: "City", value: item.identity.city });
      if (item.identity?.state) identityFields.push({ key: "State", value: item.identity.state });
      if (item.identity?.postalCode) identityFields.push({ key: "Postal Code", value: item.identity.postalCode });
      if (item.identity?.country) identityFields.push({ key: "Country", value: item.identity.country });

      if (identityFields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          identityFields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.key,
            value: field.value,
          }))
        );
      }

      // Import additional custom fields
      if (item.fields && item.fields.length > 0) {
        await orm.value.insert(haexPasswordsItemKeyValues).values(
          item.fields.map((field) => ({
            id: crypto.randomUUID(),
            itemId: newEntryId,
            key: field.name,
            value: field.value,
          }))
        );
      }
    }

    currentStep++;
    progress.value = Math.round((currentStep / totalSteps) * 100);
  }

  // Sync data
  const { syncGroupItemsAsync } = usePasswordGroupStore();
  await syncGroupItemsAsync();

  return {
    folderCount: folders.length,
    entryCount: items.length,
  };
}
