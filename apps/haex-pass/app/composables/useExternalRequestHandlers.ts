/**
 * External Request Handlers for browser extension communication
 *
 * Handles requests from external clients (browser extensions, CLI, etc.)
 * via the haex-vault WebSocket bridge.
 */

import { like, eq, or } from "drizzle-orm";
import { TOTP } from "otpauth";
import * as schema from "~/database/schemas";
import type { ExternalRequest, ExternalResponse } from "@haex-space/vault-sdk";
import {
  HAEX_PASS_METHODS,
  type GetItemsPayload,
  type GetTotpPayload,
  type SetItemPayload,
  type ItemEntry,
  type GetItemsResponseData,
  type GetTotpResponseData,
  type SetItemResponseData,
} from "~/api/external";

export function useExternalRequestHandlers() {
  const haexVaultStore = useHaexVaultStore();

  /**
   * Register all external request handlers
   * Should be called once during app initialization
   */
  const registerHandlers = () => {
    const client = haexVaultStore.client;

    // Handler: get-items
    // Returns matching entries for a given URL and field names
    client.onExternalRequest(HAEX_PASS_METHODS.GET_ITEMS, async (request) => {
      return handleGetItems(request);
    });

    // Handler: get-totp
    // Returns TOTP code for a given entry
    client.onExternalRequest(HAEX_PASS_METHODS.GET_TOTP, async (request) => {
      return handleGetTotp(request);
    });

    // Handler: set-item
    // Saves new credentials from browser extension
    client.onExternalRequest(HAEX_PASS_METHODS.SET_ITEM, async (request) => {
      return handleSetItem(request);
    });

    console.log("[haex-pass] External request handlers registered");
  };

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
   * Handle set-item request
   * Saves new credentials from browser extension
   */
  const handleSetItem = async (request: ExternalRequest): Promise<ExternalResponse> => {
    const { url, title, username, password, groupId } = request.payload as SetItemPayload;

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

      // Create new entry
      const newEntryId = crypto.randomUUID();

      await orm.insert(schema.haexPasswordsItemDetails).values({
        id: newEntryId,
        title: entryTitle || null,
        username: username || null,
        password: password || null,
        url: url || null,
        note: null,
        otpSecret: null,
        otpDigits: null,
        otpPeriod: null,
        otpAlgorithm: null,
        icon: null,
        color: null,
        tags: null,
      });

      // Create group item relation
      await orm.insert(schema.haexPasswordsGroupItems).values({
        itemId: newEntryId,
        groupId: groupId || null,
      });

      // Create initial snapshot
      const snapshotData = {
        title: entryTitle,
        username: username || null,
        password: password || null,
        url: url || null,
        note: null,
        tags: null,
        otpSecret: null,
        keyValues: [],
        attachments: [],
      };

      await orm.insert(schema.haexPasswordsItemSnapshots).values({
        id: crypto.randomUUID(),
        itemId: newEntryId,
        snapshotData: JSON.stringify(snapshotData),
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      });

      // Sync items to update UI
      const { syncGroupItemsAsync } = usePasswordGroupStore();
      await syncGroupItemsAsync();

      const responseData: SetItemResponseData = {
        entryId: newEntryId,
        title: entryTitle || "",
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] set-item error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  return {
    registerHandlers,
  };
}
