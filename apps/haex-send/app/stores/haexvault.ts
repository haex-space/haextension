// stores/haexvault.ts
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "~/database/schemas";

// Import all migration SQL files
const migrationFiles = import.meta.glob("../database/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const useHaexVaultStore = defineStore("haexvault", () => {
  const nuxtApp = useNuxtApp();

  const isInitialized = ref(false);
  const orm = shallowRef<SqliteRemoteDatabase<typeof schema> | null>(null);

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

  // Register migrations with HaexVault (it handles validation, tracking, and execution)
  const runMigrationsAsync = async () => {
    const haexVault = getHaexVault();

    // Convert migration files to array format expected by SDK
    const migrations = Object.entries(migrationFiles)
      .map(([path, content]) => {
        const fileName = path.split("/").pop()?.replace(".sql", "") || "";
        return {
          name: fileName,
          sql: content as string,
        };
      });

    console.log(`[haex-send] Registering ${migrations.length} migration(s) with HaexVault`);

    const result = await haexVault.client.registerMigrationsAsync(
      haexVault.client.extensionInfo!.version,
      migrations
    );

    console.log(
      `[haex-send] Migrations complete: ${result.appliedCount} applied, ${result.alreadyAppliedCount} already applied`
    );

    if (result.appliedMigrations.length > 0) {
      console.log(`[haex-send] Applied migrations: ${result.appliedMigrations.join(", ")}`);
    }
  };

  // Initialize and setup hook (runs once)
  const initializeAsync = async () => {
    if (isInitialized.value) return;

    const haexVault = getHaexVault();

    console.log("[haex-send] Initializing HaexVault SDK");

    // Register setup hook for database migrations
    haexVault.client.onSetup(async () => {
      await runMigrationsAsync();
    });

    // Initialize database schema
    orm.value = haexVault.client.initializeDatabase(schema);
    console.log("[haex-send] Database initialized:", !!orm.value);

    // Trigger setup to run the registered hook (migrations)
    await haexVault.client.setupComplete();
    console.log("[haex-send] Setup complete");

    // Setup context watcher
    watch(
      () => haexVault.state.value.context,
      (newContext) => {
        console.log("[haex-send] Context changed:", newContext);
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

    console.log("[haex-send] Waiting for setup completion...");
    await haexVault.client.setupComplete();
    console.log("[haex-send] Setup complete");
  };

  return {
    get client() {
      return getHaexVault().client;
    },
    get state() {
      return getHaexVault().state;
    },
    orm,
    getTableName: (tableName: string) => getHaexVault().client.getTableName(tableName),
    initializeAsync,
    waitForSetupAsync,
  };
});
