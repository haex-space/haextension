import { like, eq, or } from "drizzle-orm";
import { TOTP } from "otpauth";
import * as schema from "~/database/schemas";
import { addBinaryAsync } from "~/utils/cleanup";
import type { ExternalRequest, ExternalResponse } from "@haex-space/vault-sdk";
import type {
  GetItemsPayload,
  GetTotpPayload,
  CreateItemPayload,
  UpdateItemPayload,
  ItemEntry,
  GetItemsResponseData,
  GetTotpResponseData,
  CreateItemResponseData,
  UpdateItemResponseData,
} from "~/api/external";

export function useItemRequestHandlers() {
  const haexVaultStore = useHaexVaultStore();

  /**
   * Handle get-items request
   * Finds entries matching the URL and returns them with their custom fields
   */
  const handleGetItems = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const { url, fields } = request.payload as GetItemsPayload;

    console.log("[haex-pass] handleGetItems called with:", { url, fields });

    if (!url) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required field: url",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        console.log("[haex-pass] Database not initialized!");
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Extract domain from URL for matching
      let domain: string;
      try {
        const urlObj = new URL(url);
        domain = urlObj.hostname;
      } catch {
        domain = url;
      }

      console.log("[haex-pass] Searching for domain:", domain);

      // Find entries with matching URL
      const entries = await orm
        .select({
          id: schema.haexPasswordsItemDetails.id,
          title: schema.haexPasswordsItemDetails.title,
          username: schema.haexPasswordsItemDetails.username,
          password: schema.haexPasswordsItemDetails.password,
          url: schema.haexPasswordsItemDetails.url,
          otpSecret: schema.haexPasswordsItemDetails.otpSecret,
          autofillAliases: schema.haexPasswordsItemDetails.autofillAliases,
        })
        .from(schema.haexPasswordsItemDetails)
        .where(
          or(
            like(schema.haexPasswordsItemDetails.url, `%${domain}%`),
            eq(schema.haexPasswordsItemDetails.url, url)
          )
        );

      console.log("[haex-pass] Found entries:", entries.length, entries.map(e => ({ id: e.id, title: e.title, url: e.url })));

      // Get custom fields for each entry
      const entriesWithFields = await Promise.all(
        entries.map(async (entry) => {
          const keyValues = await orm
            .select({
              key: schema.haexPasswordsItemKeyValues.key,
              value: schema.haexPasswordsItemKeyValues.value,
            })
            .from(schema.haexPasswordsItemKeyValues)
            .where(eq(schema.haexPasswordsItemKeyValues.itemId, entry.id));

          // Build fields object with standard + custom fields
          const entryFields: Record<string, string> = {};

          // Add standard fields if they exist
          if (entry.username) entryFields.username = entry.username;
          if (entry.password) entryFields.password = entry.password;
          if (entry.otpSecret) entryFields.otp = "TOTP"; // Indicate TOTP is available

          // Add custom key-value fields
          keyValues.forEach((kv) => {
            if (kv.key && kv.value) {
              entryFields[kv.key] = kv.value;
            }
          });

          return {
            id: entry.id,
            title: entry.title || "Untitled",
            url: entry.url,
            fields: entryFields,
            hasTotp: !!entry.otpSecret,
            autofillAliases: entry.autofillAliases,
          } satisfies ItemEntry;
        })
      );

      // Filter entries to only include those with at least one requested field
      const filteredEntries = fields && fields.length > 0
        ? entriesWithFields.filter((entry) =>
            fields.some((field) => field in entry.fields)
          )
        : entriesWithFields;

      const responseData: GetItemsResponseData = {
        entries: filteredEntries,
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] get-items error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle get-totp request
   * Generates and returns the current TOTP code for an entry
   */
  const handleGetTotp = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const { entryId } = request.payload as GetTotpPayload;

    if (!entryId) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required field: entryId",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Get entry with OTP settings
      const [entry] = await orm
        .select({
          otpSecret: schema.haexPasswordsItemDetails.otpSecret,
          otpDigits: schema.haexPasswordsItemDetails.otpDigits,
          otpPeriod: schema.haexPasswordsItemDetails.otpPeriod,
          otpAlgorithm: schema.haexPasswordsItemDetails.otpAlgorithm,
        })
        .from(schema.haexPasswordsItemDetails)
        .where(eq(schema.haexPasswordsItemDetails.id, entryId))
        .limit(1);

      if (!entry || !entry.otpSecret) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Entry not found or no TOTP configured",
        };
      }

      // Use stored settings with defaults
      const digits = entry.otpDigits ?? 6;
      const period = entry.otpPeriod ?? 30;
      const algorithm = entry.otpAlgorithm ?? "SHA1";

      // Generate TOTP code using otpauth library (same as otp.vue component)
      const totp = new TOTP({
        secret: entry.otpSecret.trim(),
        digits,
        period,
        algorithm,
      });
      const totpCode = totp.generate();

      const responseData: GetTotpResponseData = {
        code: totpCode,
        validFor: period - (Math.floor(Date.now() / 1000) % period), // Seconds until code expires
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] get-totp error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle create-item request
   * Creates new credentials from browser extension (insert only)
   */
  const handleCreateItem = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const { url, title, username, password, groupId, otpSecret, otpDigits, otpPeriod, otpAlgorithm, iconBase64 } = request.payload as CreateItemPayload;

    // At minimum, we need a URL or title to create an entry
    if (!url && !title) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required field: url or title",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Extract domain for title if not provided
      let entryTitle = title;
      if (!entryTitle && url) {
        try {
          const urlObj = new URL(url);
          entryTitle = urlObj.hostname;
        } catch {
          entryTitle = url;
        }
      }

      // Process icon if provided (Base64 -> binary storage with hash reference)
      let iconRef: string | null = null;
      if (iconBase64) {
        try {
          // Decode base64 to get size
          const binaryString = atob(iconBase64);
          const size = binaryString.length;
          // Store binary and get hash reference
          const hash = await addBinaryAsync(orm, iconBase64, size, "icon");
          iconRef = `binary:${hash}`;
        } catch (error) {
          console.error("[haex-pass] Failed to process icon:", error);
          // Continue without icon if processing fails
        }
      }

      const itemId = crypto.randomUUID();

      // Create new entry
      await orm.insert(schema.haexPasswordsItemDetails).values({
        id: itemId,
        title: entryTitle || null,
        username: username || null,
        password: password || null,
        url: url || null,
        note: null,
        otpSecret: otpSecret || null,
        otpDigits: otpDigits || null,
        otpPeriod: otpPeriod || null,
        otpAlgorithm: otpAlgorithm || null,
        icon: iconRef,
        color: null,
      });

      // Create group item relation
      await orm.insert(schema.haexPasswordsGroupItems).values({
        itemId,
        groupId: groupId || null,
      });

      // Create snapshot
      const snapshotData = {
        title: entryTitle,
        username: username || null,
        password: password || null,
        url: url || null,
        note: null,
        tags: null,
        otpSecret: otpSecret || null,
        otpDigits: otpDigits || null,
        otpPeriod: otpPeriod || null,
        otpAlgorithm: otpAlgorithm || null,
        icon: iconRef,
        keyValues: [],
        attachments: [],
      };

      await orm.insert(schema.haexPasswordsItemSnapshots).values({
        id: crypto.randomUUID(),
        itemId,
        snapshotData: JSON.stringify(snapshotData),
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      });

      // Sync items to update UI
      const { syncGroupItemsAsync } = usePasswordGroupStore();
      await syncGroupItemsAsync();

      const responseData: CreateItemResponseData = {
        entryId: itemId,
        title: entryTitle || "",
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] create-item error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle update-item request
   * Updates an existing entry with provided fields
   */
  const handleUpdateItem = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const { id, url, title, username, password, otpSecret, otpDigits, otpPeriod, otpAlgorithm, iconBase64 } = request.payload as unknown as UpdateItemPayload;

    if (!id) {
      return {
        requestId: request.requestId,
        success: false,
        error: "Missing required field: id",
      };
    }

    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Look up existing entry
      const [existing] = await orm
        .select()
        .from(schema.haexPasswordsItemDetails)
        .where(eq(schema.haexPasswordsItemDetails.id, id))
        .limit(1);

      if (!existing) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Entry not found",
        };
      }

      // Build update object with only provided fields
      const updateFields: Record<string, unknown> = {};
      if (title !== undefined) updateFields.title = title || null;
      if (username !== undefined) updateFields.username = username || null;
      if (password !== undefined) updateFields.password = password || null;
      if (url !== undefined) updateFields.url = url || null;
      if (otpSecret !== undefined) updateFields.otpSecret = otpSecret || null;
      if (otpDigits !== undefined) updateFields.otpDigits = otpDigits || null;
      if (otpPeriod !== undefined) updateFields.otpPeriod = otpPeriod || null;
      if (otpAlgorithm !== undefined) updateFields.otpAlgorithm = otpAlgorithm || null;

      // Process icon if provided
      if (iconBase64 !== undefined) {
        if (iconBase64) {
          try {
            const binaryString = atob(iconBase64);
            const size = binaryString.length;
            const hash = await addBinaryAsync(orm, iconBase64, size, "icon");
            updateFields.icon = `binary:${hash}`;
          } catch (error) {
            console.error("[haex-pass] Failed to process icon:", error);
          }
        } else {
          updateFields.icon = null;
        }
      }

      await orm
        .update(schema.haexPasswordsItemDetails)
        .set(updateFields)
        .where(eq(schema.haexPasswordsItemDetails.id, id));

      // Create snapshot
      const snapshotData = {
        title: title ?? existing.title,
        username: username ?? existing.username,
        password: password ?? existing.password,
        url: url ?? existing.url,
        note: existing.note,
        tags: null,
        otpSecret: otpSecret ?? existing.otpSecret,
        otpDigits: otpDigits ?? existing.otpDigits,
        otpPeriod: otpPeriod ?? existing.otpPeriod,
        otpAlgorithm: otpAlgorithm ?? existing.otpAlgorithm,
        icon: updateFields.icon !== undefined ? updateFields.icon : existing.icon,
        keyValues: [],
        attachments: [],
      };

      await orm.insert(schema.haexPasswordsItemSnapshots).values({
        id: crypto.randomUUID(),
        itemId: id,
        snapshotData: JSON.stringify(snapshotData),
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      });

      // Sync items to update UI
      const { syncGroupItemsAsync } = usePasswordGroupStore();
      await syncGroupItemsAsync();

      const responseData: UpdateItemResponseData = {
        entryId: id,
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] update-item error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  return {
    handleGetItems,
    handleGetTotp,
    handleCreateItem,
    handleUpdateItem,
  };
}
