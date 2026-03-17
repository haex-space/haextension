import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "~/database/schemas";
import {
  isPermissionPromptError,
  isPermissionDeniedError,
  type PermissionPromptError,
  type PermissionDeniedError,
} from "@haex-space/vault-sdk";

const migrationFiles = import.meta.glob("../database/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export { isPermissionPromptError, isPermissionDeniedError, type PermissionPromptError, type PermissionDeniedError };

export const useHaexVaultStore = defineStore("haexvault", () => {
  const nuxtApp = useNuxtApp();

  const isInitialized = ref(false);
  const orm = shallowRef<SqliteRemoteDatabase<typeof schema> | null>(null);

  const pendingPermission = ref<PermissionPromptError | null>(null);
  const pendingRetryFn = shallowRef<(() => Promise<void>) | null>(null);
  const deniedPermission = ref<PermissionDeniedError | null>(null);

  const { currentThemeName, context } = storeToRefs(useUiStore());
  const { defaultLocale, locales, setLocale } = useI18n();

  const getHaexVault = () => {
    const haexVault = nuxtApp.$haexVault;
    if (!haexVault) {
      throw new Error("HaexVault plugin not available.");
    }
    return haexVault;
  };

  const runMigrationsAsync = async () => {
    const haexVault = getHaexVault();
    const migrations = Object.entries(migrationFiles).map(([path, content]) => ({
      name: path.split("/").pop()?.replace(".sql", "") || "",
      sql: content as string,
    }));

    console.log(`[haex-code] Registering ${migrations.length} migration(s)`);
    const result = await haexVault.client.registerMigrationsAsync(
      haexVault.client.extensionInfo!.version,
      migrations
    );
    console.log(`[haex-code] Migrations: ${result.appliedCount} applied, ${result.alreadyAppliedCount} already applied`);
  };

  const initializeAsync = async () => {
    if (isInitialized.value) return;
    const haexVault = getHaexVault();

    console.log("[haex-code] Initializing HaexVault SDK");
    haexVault.client.onSetup(runMigrationsAsync);
    orm.value = haexVault.client.initializeDatabase(schema);
    await haexVault.client.setupComplete();
    console.log("[haex-code] Setup complete");

    watch(
      () => haexVault.state.value.context,
      (newContext) => {
        if (!newContext) return;
        context.value = newContext;
        currentThemeName.value = (newContext.theme === "light" ? "light" : "dark");
        const locale = locales.value.find((l) => l.code === newContext.locale)?.code || defaultLocale;
        setLocale(locale);
      },
      { immediate: true }
    );

    isInitialized.value = true;
  };

  const isReady = computed(() => isInitialized.value && orm.value !== null);

  const setPermissionPrompt = (error: PermissionPromptError, retryFn: () => Promise<void>) => {
    pendingPermission.value = error;
    pendingRetryFn.value = retryFn;
  };
  const clearPermissionPrompt = () => {
    pendingPermission.value = null;
    pendingRetryFn.value = null;
  };
  const retryAfterPermissionAsync = async () => {
    const retryFn = pendingRetryFn.value;
    if (retryFn) {
      clearPermissionPrompt();
      await retryFn();
    }
  };
  const setPermissionDenied = (error: PermissionDeniedError) => { deniedPermission.value = error; };
  const clearPermissionDenied = () => { deniedPermission.value = null; };

  return {
    get client() { return getHaexVault().client; },
    get state() { return getHaexVault().state; },
    orm,
    isReady,
    initializeAsync,
    pendingPermission: computed(() => pendingPermission.value),
    setPermissionPrompt,
    clearPermissionPrompt,
    retryAfterPermissionAsync,
    deniedPermission: computed(() => deniedPermission.value),
    setPermissionDenied,
    clearPermissionDenied,
  };
});
