// stores/haexvault.ts
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import * as schema from "~/database/schemas";
import { generateVaultKey, arrayBufferToBase64, base64ToArrayBuffer } from "@haex-space/vault-sdk";

// Import all migration SQL files
const migrationFiles = import.meta.glob("../database/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Settings keys
const MASTER_KEY_SETTING = "master_key";

export type MasterKeyError = {
  type: "corrupted";
  message: string;
};

export const useHaexVaultStore = defineStore("haexvault", () => {
  const nuxtApp = useNuxtApp();

  const isInitialized = ref(false);
  const orm = shallowRef<SqliteRemoteDatabase<typeof schema> | null>(null);
  const masterKey = shallowRef<Uint8Array | null>(null);
  const masterKeyError = ref<MasterKeyError | null>(null);

  // Get composables at the top of the store setup
  const { currentThemeName, context } = storeToRefs(useUiStore());
  const { defaultLocale, locales, setLocale } = useI18n();

  // Lazy getter for haexVault to ensure plugin is loaded
  const getHaexVault = () => {
    const haexVault = nuxtApp.$haexVault;
    if (!haexVault) {
      throw new Error("HaexVault plugin not available. Make sure the store is only used client-side.");
    }
    return haexVault;
  };

  // Register migrations with HaexVault
  const runMigrationsAsync = async () => {
    const haexVault = getHaexVault();

    const migrations = Object.entries(migrationFiles)
      .map(([path, content]) => {
        const fileName = path.split("/").pop()?.replace(".sql", "") || "";
        return {
          name: fileName,
          sql: content as string,
        };
      });

    console.log(`[haex-files] Registering ${migrations.length} migration(s) with HaexVault`);

    const result = await haexVault.client.registerMigrationsAsync(
      haexVault.client.extensionInfo!.version,
      migrations
    );

    console.log(
      `[haex-files] Migrations complete: ${result.appliedCount} applied, ${result.alreadyAppliedCount} already applied`
    );

    if (result.appliedMigrations.length > 0) {
      console.log(`[haex-files] Applied migrations: ${result.appliedMigrations.join(", ")}`);
    }
  };

  /**
   * Validate master key data
   */
  const validateMasterKey = (keyBase64: string): Uint8Array | null => {
    try {
      const keyBuffer = base64ToArrayBuffer(keyBase64);
      if (keyBuffer.byteLength !== 32) {
        console.error(`[haex-files] Invalid master key length: ${keyBuffer.byteLength} (expected 32)`);
        return null;
      }
      return new Uint8Array(keyBuffer);
    } catch (e) {
      console.error("[haex-files] Failed to decode master key:", e);
      return null;
    }
  };

  /**
   * Initialize or retrieve the master key from database
   * The master key is stored in plaintext because:
   * 1. The database is encrypted with SQLCipher (vault password)
   * 2. All sync data is encrypted with vault-key before leaving the device
   */
  const initializeMasterKeyAsync = async () => {
    if (!orm.value) throw new Error("Database not initialized");

    masterKeyError.value = null;

    // Try to load existing master key (key is PRIMARY KEY, so only one can exist)
    const existing = await orm.value
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, MASTER_KEY_SETTING))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      const keyBase64 = existing[0].value;
      const decodedKey = validateMasterKey(keyBase64);

      if (!decodedKey) {
        masterKeyError.value = {
          type: "corrupted",
          message: "Master key exists but is corrupted or invalid.",
        };
        return;
      }

      masterKey.value = decodedKey;
      console.log("[haex-files] Master key loaded from database");
    } else {
      // No master key exists - generate new one
      const newKey = generateVaultKey();
      masterKey.value = newKey;

      // Store in database as base64
      const keyBase64 = arrayBufferToBase64(newKey);
      await orm.value.insert(schema.settings).values({
        key: MASTER_KEY_SETTING,
        value: keyBase64,
      });

      console.log("[haex-files] New master key generated and stored");
    }
  };

  /**
   * Recovery: Reset master key (WARNING: This will make all encrypted data unreadable!)
   */
  const resetMasterKeyAsync = async (): Promise<void> => {
    if (!orm.value) throw new Error("Database not initialized");

    console.warn("[haex-files] Resetting master key - all encrypted data will be lost!");

    // Delete existing master key
    await orm.value
      .delete(schema.settings)
      .where(eq(schema.settings.key, MASTER_KEY_SETTING));

    // Clear all spaces (their keys are now invalid)
    await orm.value.delete(schema.spaces);

    // Re-initialize (will generate new key)
    await initializeMasterKeyAsync();

    console.log("[haex-files] Master key reset complete");
  };

  // Initialize database and setup hook
  const initializeAsync = async () => {
    if (isInitialized.value) return;

    const haexVault = getHaexVault();

    console.log("[haex-files] Initializing HaexVault SDK");

    // Register setup hook for database migrations
    haexVault.client.onSetup(async () => {
      await runMigrationsAsync();
    });

    // Initialize database schema
    orm.value = haexVault.client.initializeDatabase(schema);
    console.log("[haex-files] Database initialized:", !!orm.value);

    // Run setup (migrations)
    await haexVault.client.setupComplete();
    console.log("[haex-files] Setup complete");

    // Initialize master key after migrations
    await initializeMasterKeyAsync();

    // Setup context watcher
    watch(
      () => haexVault.state.value.context,
      (newContext) => {
        console.log("[haex-files] Context changed:", newContext);
        if (!newContext) return;

        context.value = newContext;
        currentThemeName.value = newContext.theme || "dark";

        const locale =
          locales.value.find((l) => l.code === newContext.locale)?.code ||
          defaultLocale;

        setLocale(locale);
      },
      { immediate: true }
    );

    isInitialized.value = true;
  };

  // Wait for setup to complete
  const waitForSetupAsync = async () => {
    const haexVault = getHaexVault();
    if (haexVault.state.value.isSetupComplete) return;

    console.log("[haex-files] Waiting for setup completion...");
    await haexVault.client.setupComplete();
    console.log("[haex-files] Setup complete");
  };

  /**
   * Get the master key (throws if not initialized or has error)
   */
  const getMasterKey = (): Uint8Array => {
    if (masterKeyError.value) {
      throw new Error(`Master key error: ${masterKeyError.value.message}`);
    }
    if (!masterKey.value) {
      throw new Error("Master key not initialized. Call initializeAsync first.");
    }
    return masterKey.value;
  };

  /**
   * Check if the store is ready for crypto operations
   */
  const isReady = computed(() => {
    return isInitialized.value && masterKey.value !== null && masterKeyError.value === null;
  });

  return {
    get client() {
      return getHaexVault().client;
    },
    get state() {
      return getHaexVault().state;
    },
    orm,
    masterKey: computed(() => masterKey.value),
    masterKeyError: computed(() => masterKeyError.value),
    isReady,
    getMasterKey,
    resetMasterKeyAsync,
    getTableName: (tableName: string) => getHaexVault().client.getTableName(tableName),
    initializeAsync,
    waitForSetupAsync,
  };
});
