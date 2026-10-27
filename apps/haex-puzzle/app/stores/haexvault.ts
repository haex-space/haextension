const migrationFiles = import.meta.glob("../database/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Connects to the vault: registers the database migrations once per start. */
export const useHaexVaultStore = defineStore("haexvault", () => {
  const nuxtApp = useNuxtApp();
  const isReady = ref(false);
  let initializing: Promise<void> | null = null;

  const getHaexVault = () => {
    const haexVault = nuxtApp.$haexVault;
    if (!haexVault) throw new Error("HaexVault plugin not available.");
    return haexVault;
  };

  async function runMigrationsAsync() {
    const haexVault = getHaexVault();
    const migrations = Object.entries(migrationFiles).map(([path, content]) => ({
      name: path.split("/").pop()?.replace(".sql", "") ?? "",
      sql: content as string,
    }));
    await haexVault.client.registerMigrationsAsync(haexVault.client.extensionInfo!.version, migrations);
  }

  function initializeAsync(): Promise<void> {
    initializing ??= (async () => {
      const haexVault = getHaexVault();
      haexVault.client.onSetup(runMigrationsAsync);
      await haexVault.client.setupComplete();
      isReady.value = true;
    })();
    return initializing;
  }

  return {
    get client() {
      return getHaexVault().client;
    },
    isReady,
    initializeAsync,
  };
});
