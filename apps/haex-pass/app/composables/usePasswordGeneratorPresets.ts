import { eq } from "drizzle-orm";
import { haexPasswordsGeneratorPresets } from "~/database/schemas";
import type {
  InsertHaexPasswordsGeneratorPresets,
  SelectHaexPasswordsGeneratorPresets,
} from "~/database/schemas";

export type PasswordGeneratorPreset = SelectHaexPasswordsGeneratorPresets;

export interface PasswordGeneratorPresetInput {
  name: string;
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeChars: string;
  usePattern: boolean;
  pattern: string;
  isDefault?: boolean;
}

export function usePasswordGeneratorPresets() {
  const { orm } = useHaexVaultStore();

  const getAllPresetsAsync = async (): Promise<PasswordGeneratorPreset[]> => {
    if (!orm) return [];
    return await orm.select().from(haexPasswordsGeneratorPresets).all();
  };

  const getDefaultPresetAsync = async (): Promise<PasswordGeneratorPreset | null> => {
    if (!orm) return null;
    const results = await orm
      .select()
      .from(haexPasswordsGeneratorPresets)
      .where(eq(haexPasswordsGeneratorPresets.isDefault, true))
      .limit(1)
      .all();
    return results[0] ?? null;
  };

  const getPresetByIdAsync = async (id: string): Promise<PasswordGeneratorPreset | null> => {
    if (!orm) return null;
    const results = await orm
      .select()
      .from(haexPasswordsGeneratorPresets)
      .where(eq(haexPasswordsGeneratorPresets.id, id))
      .limit(1)
      .all();
    return results[0] ?? null;
  };

  const createPresetAsync = async (preset: PasswordGeneratorPresetInput): Promise<string> => {
    if (!orm) throw new Error("ORM not initialized");

    const id = crypto.randomUUID();

    // If this preset should be default, unset all other defaults first
    if (preset.isDefault) {
      await orm
        .update(haexPasswordsGeneratorPresets)
        .set({ isDefault: false })
        .run();
    }

    const insertData: InsertHaexPasswordsGeneratorPresets = {
      id,
      name: preset.name,
      length: preset.length,
      uppercase: preset.uppercase,
      lowercase: preset.lowercase,
      numbers: preset.numbers,
      symbols: preset.symbols,
      excludeChars: preset.excludeChars,
      usePattern: preset.usePattern,
      pattern: preset.pattern,
      isDefault: preset.isDefault ?? false,
    };

    await orm.insert(haexPasswordsGeneratorPresets).values(insertData).run();
    return id;
  };

  const updatePresetAsync = async (id: string, preset: Partial<PasswordGeneratorPresetInput>): Promise<void> => {
    if (!orm) throw new Error("ORM not initialized");

    // If this preset should be default, unset all other defaults first
    if (preset.isDefault) {
      await orm
        .update(haexPasswordsGeneratorPresets)
        .set({ isDefault: false })
        .run();
    }

    await orm
      .update(haexPasswordsGeneratorPresets)
      .set(preset)
      .where(eq(haexPasswordsGeneratorPresets.id, id))
      .run();
  };

  const deletePresetAsync = async (id: string): Promise<void> => {
    if (!orm) throw new Error("ORM not initialized");

    await orm
      .delete(haexPasswordsGeneratorPresets)
      .where(eq(haexPasswordsGeneratorPresets.id, id))
      .run();
  };

  const setDefaultPresetAsync = async (id: string): Promise<void> => {
    if (!orm) throw new Error("ORM not initialized");

    // Unset all defaults first
    await orm
      .update(haexPasswordsGeneratorPresets)
      .set({ isDefault: false })
      .run();

    // Set the new default
    await orm
      .update(haexPasswordsGeneratorPresets)
      .set({ isDefault: true })
      .where(eq(haexPasswordsGeneratorPresets.id, id))
      .run();
  };

  return {
    getAllPresetsAsync,
    getDefaultPresetAsync,
    getPresetByIdAsync,
    createPresetAsync,
    updatePresetAsync,
    deletePresetAsync,
    setDefaultPresetAsync,
  };
}
