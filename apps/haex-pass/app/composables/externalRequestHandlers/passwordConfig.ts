import { eq } from "drizzle-orm";
import * as schema from "~/database/schemas";
import type { ExternalRequest, ExternalResponse } from "@haex-space/vault-sdk";
import type {
  GetPasswordConfigResponseData,
  GetPasswordPresetsResponseData,
  PasswordPreset,
} from "~/api/external";

export function usePasswordConfigRequestHandlers() {
  const haexVaultStore = useHaexVaultStore();

  /**
   * Handle get-password-config request
   * Returns the default password generator preset configuration
   */
  const handleGetPasswordConfig = async (request: ExternalRequest): Promise<ExternalResponse> => {
    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Get default preset
      const [defaultPreset] = await orm
        .select()
        .from(schema.haexPasswordsGeneratorPresets)
        .where(eq(schema.haexPasswordsGeneratorPresets.isDefault, true))
        .limit(1);

      let responseData: GetPasswordConfigResponseData;

      if (defaultPreset) {
        responseData = {
          config: {
            length: defaultPreset.length,
            uppercase: defaultPreset.uppercase,
            lowercase: defaultPreset.lowercase,
            numbers: defaultPreset.numbers,
            symbols: defaultPreset.symbols,
            excludeChars: defaultPreset.excludeChars || null,
            usePattern: defaultPreset.usePattern,
            pattern: defaultPreset.pattern || null,
          },
          presetName: defaultPreset.name,
        };
      } else {
        // No default preset configured - return null config
        responseData = {
          config: null,
          presetName: null,
        };
      }

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] get-password-config error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  /**
   * Handle get-password-presets request
   * Returns all password generator presets
   */
  const handleGetPasswordPresets = async (request: ExternalRequest): Promise<ExternalResponse> => {
    try {
      const orm = haexVaultStore.orm;
      if (!orm) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Database not initialized",
        };
      }

      // Get all presets
      const presets = await orm
        .select()
        .from(schema.haexPasswordsGeneratorPresets);

      const responseData: GetPasswordPresetsResponseData = {
        presets: presets.map((preset): PasswordPreset => ({
          id: preset.id,
          name: preset.name,
          isDefault: preset.isDefault,
          config: {
            length: preset.length,
            uppercase: preset.uppercase,
            lowercase: preset.lowercase,
            numbers: preset.numbers,
            symbols: preset.symbols,
            excludeChars: preset.excludeChars || null,
            usePattern: preset.usePattern,
            pattern: preset.pattern || null,
          },
        })),
      };

      return {
        requestId: request.requestId,
        success: true,
        data: responseData,
      };
    } catch (error) {
      console.error("[haex-pass] get-password-presets error:", error);
      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  return {
    handleGetPasswordConfig,
    handleGetPasswordPresets,
  };
}
